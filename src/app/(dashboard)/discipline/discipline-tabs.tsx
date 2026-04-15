"use client";

import { type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { LiftRestrictionButton, DeleteRestrictionButton } from "./lift-restriction-button";

const RESTRICTION_TYPE_LABELS: Record<string, string> = {
  no_leave: "No Leave",
  weekend_restriction: "Weekend",
  house_commitment: "House Commitment",
  curfew: "Curfew",
  custom: "Custom",
};

interface ActiveRestriction {
  id: string;
  resident_id: string;
  house_id: string;
  restriction_type: string;
  description: string;
  notes: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  is_house_commitment: boolean;
  updated_at: string;
  resident_name: string;
  house_name: string;
}

interface PastRestriction {
  id: string;
  restriction_type: string;
  description: string;
  end_date: string | null;
  updated_at: string;
  resident_name: string;
}

interface DisciplineTabsProps {
  isStaff: boolean;
  activeRestrictions: ActiveRestriction[];
  pastRestrictions: PastRestriction[];
  addRestrictionButton: ReactNode;
  demeritMatrixContent: ReactNode;
}

export function DisciplineTabs({
  isStaff,
  activeRestrictions,
  pastRestrictions,
  addRestrictionButton,
  demeritMatrixContent,
}: DisciplineTabsProps) {
  return (
    <Tabs defaultValue={0}>
      <TabsList>
        <TabsTrigger value={0}>Demerits</TabsTrigger>
        <TabsTrigger value={1}>
          Restrictions
          {activeRestrictions.length > 0 && (
            <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
              {activeRestrictions.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      {/* Demerits Tab */}
      <TabsContent value={0}>
        <div className="space-y-6 pt-2">
          {demeritMatrixContent}
        </div>
      </TabsContent>

      {/* Restrictions Tab */}
      <TabsContent value={1}>
        <div className="space-y-6 pt-2">
          {/* Add Restriction button */}
          {addRestrictionButton && (
            <div className="flex justify-end">
              {addRestrictionButton}
            </div>
          )}

          {/* Active Restrictions */}
          <section>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Active Restrictions
              {activeRestrictions.length > 0 && (
                <Badge variant="destructive">{activeRestrictions.length}</Badge>
              )}
            </h2>
            {activeRestrictions.length > 0 ? (
              <div className="space-y-3">
                {activeRestrictions.map((r) => {
                  const typeLabel = RESTRICTION_TYPE_LABELS[r.restriction_type] ?? r.restriction_type;
                  return (
                    <Card key={r.id} className="border-red-200">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{r.resident_name}</span>
                              {r.house_name && (
                                <Badge variant="outline" className="text-xs">{r.house_name}</Badge>
                              )}
                              <Badge variant="destructive" className="text-xs">{typeLabel}</Badge>
                              {r.is_house_commitment && (
                                <Badge variant="secondary" className="text-xs">New Intake</Badge>
                              )}
                            </div>
                            <p className="text-sm">{r.description}</p>
                            {r.notes && (
                              <p className="text-sm text-muted-foreground italic">Note: {r.notes}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>From: {new Date(r.start_date).toLocaleDateString()}</span>
                              {r.end_date ? (
                                <span>Until: {new Date(r.end_date).toLocaleDateString()}</span>
                              ) : (
                                <span>Indefinite</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isStaff && <LiftRestrictionButton restrictionId={r.id} />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No active restrictions.</p>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Past Restrictions */}
          {pastRestrictions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 text-muted-foreground">
                Past Restrictions
              </h2>
              <div className="space-y-2">
                {pastRestrictions.map((r) => {
                  const typeLabel = RESTRICTION_TYPE_LABELS[r.restriction_type] ?? r.restriction_type;
                  return (
                    <Card key={r.id} className="opacity-60">
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{r.resident_name}</span>
                            <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
                            <span className="text-xs text-muted-foreground">{r.description}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {r.end_date
                                ? `Expired ${new Date(r.end_date).toLocaleDateString()}`
                                : `Lifted ${new Date(r.updated_at).toLocaleDateString()}`}
                            </span>
                            {isStaff && <DeleteRestrictionButton restrictionId={r.id} />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
