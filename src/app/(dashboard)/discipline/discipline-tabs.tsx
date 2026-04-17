"use client";

import { type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { LiftRestrictionButton, DeleteRestrictionButton } from "./lift-restriction-button";

const RESTRICTION_TYPE_LABELS: Record<string, string> = {
  no_leave: "No Leave",
  no_overnight: "No Overnight",
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

interface Incident {
  id: string;
  severity: string;
  category: string | null;
  description: string;
  occurred_at: string;
  photo_url: string | null;
  resident_name: string;
  house_name: string;
  reporter_name: string;
}

interface DisciplineTabsProps {
  isStaff: boolean;
  activeRestrictions: ActiveRestriction[];
  pastRestrictions: PastRestriction[];
  addRestrictionButton: ReactNode;
  demeritMatrixContent: ReactNode;
  warningsContent?: ReactNode;
  warningsCount?: number;
  incidents?: Incident[];
  addIncidentButton?: ReactNode;
}

export function DisciplineTabs({
  isStaff,
  activeRestrictions,
  pastRestrictions,
  addRestrictionButton,
  demeritMatrixContent,
  warningsContent,
  warningsCount = 0,
  incidents = [],
  addIncidentButton,
}: DisciplineTabsProps) {
  return (
    <Tabs defaultValue="demerits">
      <TabsList>
        <TabsTrigger value="demerits">Demerits</TabsTrigger>
        <TabsTrigger value="warnings">
          Warnings
          {warningsCount > 0 && (
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
              {warningsCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="restrictions">
          Restrictions
          {activeRestrictions.length > 0 && (
            <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">
              {activeRestrictions.length}
            </Badge>
          )}
        </TabsTrigger>
        {isStaff && (
          <TabsTrigger value="incidents">
            Incidents
            {incidents.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                {incidents.length}
              </Badge>
            )}
          </TabsTrigger>
        )}
      </TabsList>

      {/* Demerits Tab */}
      <TabsContent value="demerits">
        <div className="space-y-6 pt-2">
          {demeritMatrixContent}
        </div>
      </TabsContent>

      {/* Warnings Tab */}
      <TabsContent value="warnings">
        <div className="space-y-6 pt-2">{warningsContent}</div>
      </TabsContent>

      {/* Restrictions Tab */}
      <TabsContent value="restrictions">
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
      {/* Incidents Tab */}
      {isStaff && (
        <TabsContent value="incidents">
          <div className="space-y-4 pt-2">
            {addIncidentButton && (
              <div className="flex justify-end">
                {addIncidentButton}
              </div>
            )}

            {incidents.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertTriangle className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">No incidents recorded</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {incidents.map((inc) => (
                  <Card key={inc.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              inc.severity === "critical"
                                ? "destructive"
                                : inc.severity === "major"
                                  ? "secondary"
                                  : "outline"
                            }
                            className="capitalize"
                          >
                            {inc.severity}
                          </Badge>
                          <span className="font-medium text-sm">
                            {inc.resident_name}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(inc.occurred_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{inc.description}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {inc.category && <span>Category: {inc.category}</span>}
                        {inc.house_name && <span>· {inc.house_name}</span>}
                        <span>· Reported by {inc.reporter_name}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      )}
    </Tabs>
  );
}
