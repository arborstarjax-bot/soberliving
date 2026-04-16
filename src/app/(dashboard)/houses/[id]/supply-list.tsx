"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Trash2 } from "lucide-react";
import {
  addSupplyItem,
  toggleSupplyStock,
  deleteSupplyItem,
} from "./supply-actions";

export interface SupplyItem {
  id: string;
  name: string;
  is_in_stock: boolean;
  updated_at: string;
}

interface SupplyListProps {
  houseId: string;
  items: SupplyItem[];
  canManage: boolean;
}

export function SupplyList({ houseId, items, canManage }: SupplyListProps) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return;
    const fd = new FormData();
    fd.set("houseId", houseId);
    fd.set("name", name.trim());
    startTransition(async () => {
      const result = await addSupplyItem(fd);
      if (result?.error) {
        setError(result.error);
      } else {
        setName("");
      }
    });
  }

  const inStock = items.filter((i) => i.is_in_stock);
  const outOfStock = items.filter((i) => !i.is_in_stock);

  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input
            placeholder="Add a supply item (e.g. Toilet paper)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isPending}
          />
          <Button type="submit" disabled={isPending || !name.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">
              No supplies tracked for this house yet
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <SupplyGroup
            title="In stock"
            items={inStock}
            canManage={canManage}
            isPending={isPending}
            startTransition={startTransition}
          />
          <SupplyGroup
            title="Out of stock"
            items={outOfStock}
            canManage={canManage}
            isPending={isPending}
            startTransition={startTransition}
            highlight
          />
        </div>
      )}
    </div>
  );
}

function SupplyGroup({
  title,
  items,
  canManage,
  isPending,
  startTransition,
  highlight,
}: {
  title: string;
  items: SupplyItem[];
  canManage: boolean;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Badge variant="outline" className="text-[10px]">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <Card
              key={item.id}
              className={highlight && !item.is_in_stock ? "border-destructive/30" : ""}
            >
              <CardContent className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant={item.is_in_stock ? "default" : "destructive"}
                    className="text-[10px]"
                  >
                    {item.is_in_stock ? "In stock" : "Out"}
                  </Badge>
                  <span className="text-sm truncate">{item.name}</span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await toggleSupplyStock(item.id);
                          if (result?.error) alert(result.error);
                        })
                      }
                    >
                      {item.is_in_stock ? "Mark out" : "Mark in"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(`Delete "${item.name}"?`)
                        )
                          return;
                        startTransition(async () => {
                          const result = await deleteSupplyItem(item.id);
                          if (result?.error) alert(result.error);
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
