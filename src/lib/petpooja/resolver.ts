import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/db/client";

/**
 * Minimal Prisma interface required by the resolver for testability and DI.
 */
export type ResolverPrismaClient = Pick<
  PrismaClient,
  "outlet" | "outletProductSetting" | "product"
>;

/**
 * Resolved outlet context.
 */
export interface ResolvedOutlet {
  outletId: string;
  organizationId: string;
  outletCode: string;
  outletName: string;
}

/**
 * Result of attempting to resolve an outlet from Petpooja restID.
 */
export type OutletResolutionResult =
  | { success: true; outlet: ResolvedOutlet }
  | { success: false; code: "OUTLET_UNMAPPED"; message: string; restId: string };

/**
 * Matching strategy by which a product was resolved.
 */
export type ProductMatchMethod =
  | "outlet_setting_item_id"
  | "org_product_code"
  | "unmatched";

/**
 * Result of attempting to resolve a product from a Petpooja line item.
 */
export interface ProductResolutionResult {
  productId: string | null;
  matchMethod: ProductMatchMethod;
  petpoojaItemId: string;
  petpoojaItemCode: string;
  itemName: string;
}

/**
 * In-memory mapping cache for high-throughput batch resolution.
 */
export interface OutletResolutionContext {
  outlet: ResolvedOutlet;
  // Maps petpoojaItemId (lowercase trimmed) -> Product ID
  outletItemSettingsMap: Map<string, string>;
  // Maps productCode (trimmed) -> Product ID within outlet's organization
  orgProductCodeMap: Map<string, string>;
}

/**
 * Petpooja Outlet & Product Resolver
 *
 * Responsibilities:
 * 1. Resolves `Restaurant.restID` to internal `Outlet` via `Outlet.petpoojaRestId`.
 * 2. Resolves line item to `Product` via:
 *    - Priority 1: `OutletProductSetting.petpoojaItemId` for the resolved outlet.
 *    - Priority 2: `Product.productCode` within the outlet's parent organization.
 *    - Priority 3: Fallback `productId: null` (unmatched) without crashing or guessing.
 * 3. Enforces organization-scoping (never matches products across organizations).
 */
export class PetpoojaResolver {
  private prisma: ResolverPrismaClient;

  constructor(prismaClient?: ResolverPrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  /**
   * Resolves Petpooja restID to an internal Outlet.
   *
   * Rules:
   * - Strict exact match on `Outlet.petpoojaRestId`.
   * - Never guesses based on outlet name, city, or address.
   * - Returns structured `OUTLET_UNMAPPED` on missing or null match.
   */
  public async resolveOutlet(restId: string): Promise<OutletResolutionResult> {
    const trimmedRestId = restId?.trim();
    if (!trimmedRestId) {
      return {
        success: false,
        code: "OUTLET_UNMAPPED",
        message: "Petpooja restID is empty or invalid.",
        restId: restId ?? "",
      };
    }

    const outlet = await this.prisma.outlet.findUnique({
      where: { petpoojaRestId: trimmedRestId },
      select: {
        id: true,
        organizationId: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!outlet || !outlet.isActive) {
      return {
        success: false,
        code: "OUTLET_UNMAPPED",
        message: outlet
          ? `Outlet '${outlet.name}' (${outlet.code}) mapped to restID '${trimmedRestId}' is inactive.`
          : `No active outlet found mapped to Petpooja restID '${trimmedRestId}'.`,
        restId: trimmedRestId,
      };
    }

    return {
      success: true,
      outlet: {
        outletId: outlet.id,
        organizationId: outlet.organizationId,
        outletCode: outlet.code,
        outletName: outlet.name,
      },
    };
  }

  /**
   * Resolves a single line item's product for a specific outlet.
   *
   * Priority:
   * 1. Outlet-specific mapping: `OutletProductSetting.petpoojaItemId === item.petpoojaItemId`
   * 2. Organization product code fallback: `Product.productCode === item.petpoojaItemCode` where `organizationId === outlet.organizationId`
   * 3. Unmatched: `productId: null`
   */
  public async resolveProduct(
    outlet: ResolvedOutlet,
    item: {
      petpoojaItemId: string;
      petpoojaItemCode: string;
      itemName: string;
    }
  ): Promise<ProductResolutionResult> {
    const itemId = item.petpoojaItemId?.trim();
    const itemCode = item.petpoojaItemCode?.trim();

    // Priority 1: Check OutletProductSetting for this outlet
    if (itemId) {
      const setting = await this.prisma.outletProductSetting.findFirst({
        where: {
          outletId: outlet.outletId,
          petpoojaItemId: itemId,
        },
        select: {
          productId: true,
        },
      });

      if (setting?.productId) {
        return {
          productId: setting.productId,
          matchMethod: "outlet_setting_item_id",
          petpoojaItemId: item.petpoojaItemId,
          petpoojaItemCode: item.petpoojaItemCode,
          itemName: item.itemName,
        };
      }
    }

    // Priority 2: Check organization-level Product.productCode
    if (itemCode) {
      const product = await this.prisma.product.findUnique({
        where: {
          organizationId_productCode: {
            organizationId: outlet.organizationId,
            productCode: itemCode,
          },
        },
        select: {
          id: true,
        },
      });

      if (product?.id) {
        return {
          productId: product.id,
          matchMethod: "org_product_code",
          petpoojaItemId: item.petpoojaItemId,
          petpoojaItemCode: item.petpoojaItemCode,
          itemName: item.itemName,
        };
      }
    }

    // Priority 3: Unmatched fallback
    return {
      productId: null,
      matchMethod: "unmatched",
      petpoojaItemId: item.petpoojaItemId,
      petpoojaItemCode: item.petpoojaItemCode,
      itemName: item.itemName,
    };
  }

  /**
   * Builds an in-memory resolution context for an outlet.
   * Used for high-throughput batch order processing to avoid per-item database roundtrips.
   */
  public async buildOutletResolutionContext(
    outlet: ResolvedOutlet
  ): Promise<OutletResolutionContext> {
    // 1. Fetch all outlet product settings with petpoojaItemId for this outlet
    const settings = await this.prisma.outletProductSetting.findMany({
      where: {
        outletId: outlet.outletId,
        petpoojaItemId: { not: null },
      },
      select: {
        productId: true,
        petpoojaItemId: true,
      },
    });

    const outletItemSettingsMap = new Map<string, string>();
    for (const s of settings) {
      if (s.petpoojaItemId?.trim()) {
        outletItemSettingsMap.set(s.petpoojaItemId.trim(), s.productId);
      }
    }

    // 2. Fetch all products belonging to the outlet's organization
    const products = await this.prisma.product.findMany({
      where: {
        organizationId: outlet.organizationId,
      },
      select: {
        id: true,
        productCode: true,
      },
    });

    const orgProductCodeMap = new Map<string, string>();
    for (const p of products) {
      if (p.productCode?.trim()) {
        orgProductCodeMap.set(p.productCode.trim(), p.id);
      }
    }

    return {
      outlet,
      outletItemSettingsMap,
      orgProductCodeMap,
    };
  }

  /**
   * Resolves a line item using a pre-fetched in-memory context (zero SQL queries).
   */
  public resolveProductWithContext(
    context: OutletResolutionContext,
    item: {
      petpoojaItemId: string;
      petpoojaItemCode: string;
      itemName: string;
    }
  ): ProductResolutionResult {
    const itemId = item.petpoojaItemId?.trim();
    const itemCode = item.petpoojaItemCode?.trim();

    // Priority 1: Outlet-specific mapping
    if (itemId && context.outletItemSettingsMap.has(itemId)) {
      return {
        productId: context.outletItemSettingsMap.get(itemId)!,
        matchMethod: "outlet_setting_item_id",
        petpoojaItemId: item.petpoojaItemId,
        petpoojaItemCode: item.petpoojaItemCode,
        itemName: item.itemName,
      };
    }

    // Priority 2: Org-scoped product code
    if (itemCode && context.orgProductCodeMap.has(itemCode)) {
      return {
        productId: context.orgProductCodeMap.get(itemCode)!,
        matchMethod: "org_product_code",
        petpoojaItemId: item.petpoojaItemId,
        petpoojaItemCode: item.petpoojaItemCode,
        itemName: item.itemName,
      };
    }

    // Priority 3: Unmatched fallback
    return {
      productId: null,
      matchMethod: "unmatched",
      petpoojaItemId: item.petpoojaItemId,
      petpoojaItemCode: item.petpoojaItemCode,
      itemName: item.itemName,
    };
  }
}

