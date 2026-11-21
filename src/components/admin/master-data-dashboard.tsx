"use client";

import { useState } from "react";
import { Building2, UtensilsCrossed, Wheat, BookOpen, ChefHat, Wine, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepartmentsSection } from "./departments-section";
import { ProductsSection } from "./products-section";
import { IngredientsSection } from "./ingredients-section";
import { RecipesSection } from "./recipes-section";
import { PreparationItemsSection } from "./preparation-items-section";
import { BreakageItemsSection } from "./breakage-items-section";
import { ReasonsSection } from "./reasons-section";

export function MasterDataDashboard() {
  const [activeTab, setActiveTab] = useState<string>("departments");

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="overflow-x-auto pb-1">
          <TabsList
            variant="line"
            className="flex w-full min-w-max justify-start border-b border-border pb-px group-data-horizontal/tabs:h-11"
          >
            <TabsTrigger
              value="departments"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <Building2 className="h-4 w-4" />
              <span>Departments</span>
            </TabsTrigger>
            <TabsTrigger
              value="prepItems"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <ChefHat className="h-4 w-4" />
              <span>Preparation Items</span>
            </TabsTrigger>
            <TabsTrigger
              value="products"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <UtensilsCrossed className="h-4 w-4" />
              <span>Menu Products</span>
            </TabsTrigger>
            <TabsTrigger
              value="ingredients"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <Wheat className="h-4 w-4" />
              <span>Ingredients</span>
            </TabsTrigger>
            <TabsTrigger
              value="recipes"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <BookOpen className="h-4 w-4" />
              <span>Recipes</span>
            </TabsTrigger>
            <TabsTrigger
              value="breakageItems"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <Wine className="h-4 w-4" />
              <span>Breakage Items</span>
            </TabsTrigger>
            <TabsTrigger
              value="reasons"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors hover:text-foreground data-active:text-primary after:bottom-0 after:h-0.5 after:bg-primary"
            >
              <Tag className="h-4 w-4" />
              <span>Reasons</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="departments" className="space-y-4">
          <DepartmentsSection />
        </TabsContent>

        <TabsContent value="prepItems" className="space-y-4">
          <PreparationItemsSection />
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <ProductsSection />
        </TabsContent>

        <TabsContent value="ingredients" className="space-y-4">
          <IngredientsSection />
        </TabsContent>

        <TabsContent value="recipes" className="space-y-4">
          <RecipesSection />
        </TabsContent>

        <TabsContent value="breakageItems" className="space-y-4">
          <BreakageItemsSection />
        </TabsContent>

        <TabsContent value="reasons" className="space-y-4">
          <ReasonsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
