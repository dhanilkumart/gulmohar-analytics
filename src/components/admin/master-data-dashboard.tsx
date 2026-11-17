"use client";

import { useState } from "react";
import { Building2, UtensilsCrossed, Wheat, BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DepartmentsSection } from "./departments-section";
import { ProductsSection } from "./products-section";
import { IngredientsSection } from "./ingredients-section";
import { RecipesSection } from "./recipes-section";

export function MasterDataDashboard() {
  const [activeTab, setActiveTab] = useState<string>("departments");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Master Data Management</h1>
        <p className="text-muted-foreground text-sm">
          Organization-level catalogs, outlet assignments, product pricing, ingredients, and recipes.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted grid w-full grid-cols-2 md:w-auto md:grid-cols-4">
          <TabsTrigger value="departments" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span>Departments</span>
          </TabsTrigger>
          <TabsTrigger value="products" className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4" />
            <span>Products & Menu</span>
          </TabsTrigger>
          <TabsTrigger value="ingredients" className="flex items-center gap-2">
            <Wheat className="h-4 w-4" />
            <span>Ingredients</span>
          </TabsTrigger>
          <TabsTrigger value="recipes" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>Recipe Mapping</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departments" className="space-y-4">
          <DepartmentsSection />
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
      </Tabs>
    </div>
  );
}
