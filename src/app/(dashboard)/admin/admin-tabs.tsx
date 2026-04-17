"use client";

import { useActionState, useState, useTransition } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  Users,
  ClipboardCheck,
  CalendarClock,
  ShieldAlert,
  DollarSign,
  UserCog,
  Plus,
  Check,
  X,
  RotateCcw,
  MoreVertical,
  Bed,
} from "lucide-react";

// Existing server actions from other pages
import { createHouse } from "@/app/(dashboard)/houses/actions";
import { createResident, assignBed } from "@/app/(dashboard)/residents/actions";
import { createChore } from "@/app/(dashboard)/chores/actions";
import { addChoreTask, removeChoreTask, archiveChore } from "@/app/(dashboard)/chores/actions";
import { approveAdminRequest, denyAdminRequest, markLeaveReturned } from "@/app/(dashboard)/leave-requests/actions";
import { createIncident } from "@/app/(dashboard)/incidents/actions";
import { changeUserRole, deactivateUser, assignManagerToHouses } from "@/app/(dashboard)/users/actions";

import Link from "next/link";

// Admin-specific actions
import { issueDemerit, resolveDemerit } from "./actions";

// Share the polished Record Payment dialog + receipt download controls
// with /payments so the admin tab and the standalone page behave the
// same way — same charge selection, same receipt generation, same void
// flow. We don't want two parallel UIs drifting apart.
import { CreatePaymentDialog } from "@/app/(dashboard)/payments/create-payment-dialog";
import { DownloadReceiptButton } from "@/app/(dashboard)/payments/download-receipt-button";
import { todayLocalIso } from "@/lib/local-date";

// ─── Types ───────────────────────────────────────────────────

interface HouseItem {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  capacity: number;
  is_active: boolean;
}

interface ResidentItem {
  id: string;
  full_name: string;
  house_id: string;
  status: string;
  phone: string | null;
  email: string | null;
  move_in_date: string;
  sobriety_date: string | null;
}

interface RoomItem {
  id: string;
  house_id: string;
  name: string;
  beds: Array<{ id: string; label: string; is_active: boolean; is_occupied: boolean }>;
}

interface ChoreItem {
  id: string;
  house_id: string;
  name: string;
  sort_order: number;
  tasks: Array<{ id: string; description: string; sort_order: number }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AdminTabsProps {
  isAdmin: boolean;
  houses: HouseItem[];
  residents: ResidentItem[];
  rooms: RoomItem[];
  chores: ChoreItem[];
  rotations: any[];
  pendingSignoffs: any[];
  pendingLeave: any[];
  demerits: any[];
  activeDemeritsCount: number;
  incidents: any[];
  users: any[];
  openCharges: any[];
  recentPayments: any[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Main Component ──────────────────────────────────────────

export function AdminTabs({
  isAdmin,
  houses,
  residents,
  rooms,
  chores,
  pendingSignoffs,
  pendingLeave,
  demerits,
  activeDemeritsCount,
  incidents,
  users,
  openCharges,
  recentPayments,
}: AdminTabsProps) {
  const todayIso = todayLocalIso();
  const pastDueCount = openCharges.filter((c) => c.due_date < todayIso).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {isAdmin ? "Admin Panel" : "Manager Panel"}
        </h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Manage all houses, residents, staff, and operations"
            : "Manage your assigned houses and residents"}
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-3 grid-cols-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Houses" value={houses.length} icon={Home} />
        <StatCard label="Active Residents" value={residents.length} icon={Users} />
        <StatCard label="Pending Leave" value={pendingLeave.length} icon={CalendarClock} />
        <StatCard label="Chore Reviews" value={pendingSignoffs.length} icon={ClipboardCheck} />
        <StatCard label="Active Demerits" value={activeDemeritsCount} icon={ShieldAlert} />
        <StatCard label="Past Due" value={pastDueCount} icon={DollarSign} />
      </div>

      <Tabs defaultValue="houses">
        <TabsList className="w-full overflow-x-auto justify-start no-scrollbar [&>button]:flex-none [&>button]:whitespace-nowrap">
          <TabsTrigger value="houses">
            <Home className="h-3.5 w-3.5 mr-1" /> Houses & Beds
          </TabsTrigger>
          <TabsTrigger value="residents">
            <Users className="h-3.5 w-3.5 mr-1" /> Residents
          </TabsTrigger>
          <TabsTrigger value="chores">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Chores
          </TabsTrigger>
          <TabsTrigger value="leave">
            <CalendarClock className="h-3.5 w-3.5 mr-1" /> Leave
            {pendingLeave.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {pendingLeave.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="demerits">
            <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Demerits & Incidents
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users">
              <UserCog className="h-3.5 w-3.5 mr-1" /> Users & Roles
            </TabsTrigger>
          )}
          <TabsTrigger value="payments">
            <DollarSign className="h-3.5 w-3.5 mr-1" /> Payments
            {pastDueCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {pastDueCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Houses & Beds ─── */}
        <TabsContent value="houses">
          <HousesTab houses={houses} rooms={rooms} residents={residents} isAdmin={isAdmin} />
        </TabsContent>

        {/* ─── Residents ─── */}
        <TabsContent value="residents">
          <ResidentsTab houses={houses} residents={residents} />
        </TabsContent>

        {/* ─── Chores ─── */}
        <TabsContent value="chores">
          <ChoresTab houses={houses} chores={chores} pendingSignoffs={pendingSignoffs} />
        </TabsContent>

        {/* ─── Leave Requests ─── */}
        <TabsContent value="leave">
          <LeaveTab pendingLeave={pendingLeave} />
        </TabsContent>

        {/* ─── Demerits & Incidents ─── */}
        <TabsContent value="demerits">
          <DemeritsTab
            houses={houses}
            residents={residents}
            demerits={demerits}
            incidents={incidents}
          />
        </TabsContent>

        {/* ─── Users & Roles (admin only) ─── */}
        {isAdmin && (
          <TabsContent value="users">
            <UsersTab users={users} houses={houses} />
          </TabsContent>
        )}

        {/* ─── Payments ─── */}
        <TabsContent value="payments">
          <PaymentsTab
            houses={houses}
            residents={residents}
            openCharges={openCharges}
            recentPayments={recentPayments}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Stat Card ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ─── Houses & Beds Tab ───────────────────────────────────────

function HousesTab({
  houses,
  rooms,
  residents,
  isAdmin,
}: {
  houses: HouseItem[];
  rooms: RoomItem[];
  residents: ResidentItem[];
  isAdmin: boolean;
}) {
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");
  const houseRooms = rooms.filter((r) => r.house_id === selectedHouse);
  const houseResidents = residents.filter((r) => r.house_id === selectedHouse);
  const selectedHouseData = houses.find((h) => h.id === selectedHouse);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">House:</label>
          <select
            value={selectedHouse}
            onChange={(e) => setSelectedHouse(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && <CreateHouseInline />}
      </div>

      {selectedHouseData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedHouseData.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {selectedHouseData.address && (
              <p className="text-muted-foreground">{selectedHouseData.address}</p>
            )}
            {selectedHouseData.phone && (
              <p className="text-muted-foreground">{selectedHouseData.phone}</p>
            )}
            <p>Capacity: {houseRooms.reduce((sum, r) => sum + r.beds.length, 0)} beds</p>
          </CardContent>
        </Card>
      )}

      <h3 className="font-semibold text-sm">Rooms & Beds</h3>
      {houseRooms.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No rooms defined for this house.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {houseRooms.map((room) => (
            <Card key={room.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{room.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {room.beds.map((bed) => (
                    <div key={bed.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Bed className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{bed.label}</span>
                      </div>
                      {bed.is_occupied ? (
                        <Badge variant="secondary" className="text-xs">Occupied</Badge>
                      ) : (
                        <AssignBedButton
                          bedId={bed.id}
                          houseId={selectedHouse}
                          residents={houseResidents}
                        />
                      )}
                    </div>
                  ))}
                  {room.beds.length === 0 && (
                    <p className="text-xs text-muted-foreground">No beds</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateHouseInline() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createHouse, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add House
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create House</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-house-name">House Name *</Label>
            <Input id="admin-house-name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-house-address">Address</Label>
            <Input id="admin-house-address" name="address" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-house-phone">Phone</Label>
            <Input id="admin-house-phone" name="phone" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating…" : "Create House"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignBedButton({
  bedId,
  houseId,
  residents,
}: {
  bedId: string;
  houseId: string;
  residents: ResidentItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showSelect, setShowSelect] = useState(false);
  const [selectedResident, setSelectedResident] = useState("");

  if (!showSelect) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs"
        onClick={() => setShowSelect(true)}
      >
        Assign
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={selectedResident}
        onChange={(e) => setSelectedResident(e.target.value)}
        className="h-6 text-xs rounded border border-input bg-transparent px-1"
      >
        <option value="">Select…</option>
        {residents.map((r) => (
          <option key={r.id} value={r.id}>
            {r.full_name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="default"
        className="h-6 text-xs px-2"
        disabled={!selectedResident || isPending}
        onClick={() =>
          startTransition(() => {
            assignBed(selectedResident, bedId, houseId);
            setShowSelect(false);
            setSelectedResident("");
          })
        }
      >
        {isPending ? "…" : <Check className="h-3 w-3" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 text-xs px-1"
        onClick={() => {
          setShowSelect(false);
          setSelectedResident("");
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Residents Tab ───────────────────────────────────────────

function ResidentsTab({
  houses,
  residents,
}: {
  houses: HouseItem[];
  residents: ResidentItem[];
}) {
  const [filterHouse, setFilterHouse] = useState("");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createResident, undefined);

  const filtered = filterHouse
    ? residents.filter((r) => r.house_id === filterHouse)
    : residents;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Filter by house:</label>
          <select
            value={filterHouse}
            onChange={(e) => setFilterHouse(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            <option value="">All Houses</option>
            {houses.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Resident
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
            <DialogHeader>
              <DialogTitle>New Resident Intake</DialogTitle>
            </DialogHeader>
            <form action={action} className="space-y-4">
              <div className="space-y-2">
                <Label>House *</Label>
                <select name="house_id" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Select house</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input name="full_name" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input name="phone" type="tel" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input name="email" type="email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input name="date_of_birth" type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Move-in Date *</Label>
                  <Input name="move_in_date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Sobriety Date</Label>
                <Input name="sobriety_date" type="date" />
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">Emergency Contact</p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Name *</Label>
                    <Input name="emergency_contact_name" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Phone *</Label>
                      <Input name="emergency_contact_phone" type="tel" required />
                    </div>
                    <div className="space-y-2">
                      <Label>Relationship</Label>
                      <Input name="emergency_contact_relationship" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Intake Notes</Label>
                <Textarea name="notes" rows={3} />
              </div>
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Creating…" : "Create Resident"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No active residents.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const houseName = houses.find((h) => h.id === r.house_id)?.name ?? "Unknown";
            return (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{r.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {houseName} &middot; Moved in {new Date(r.move_in_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.phone && <span>{r.phone}</span>}
                    {r.email && <span>{r.email}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Chores Tab ──────────────────────────────────────────────

function ChoresTab({
  houses,
  chores,
  pendingSignoffs,
}: {
  houses: HouseItem[];
  chores: ChoreItem[];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  pendingSignoffs: any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */
}) {
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");
  const [openCreate, setOpenCreate] = useState(false);
  const [createState, createAction, createPending] = useActionState(createChore, undefined);

  const houseChores = chores.filter((c) => c.house_id === selectedHouse);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">House:</label>
          <select
            value={selectedHouse}
            onChange={(e) => setSelectedHouse(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          >
            {houses.map((h) => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Chore
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Chore</DialogTitle>
            </DialogHeader>
            <form action={createAction} className="space-y-4">
              <input type="hidden" name="house_id" value={selectedHouse} />
              <div className="space-y-2">
                <Label>Chore Name *</Label>
                <Input name="name" required placeholder="e.g. Kitchen Clean" />
              </div>
              <div className="space-y-2">
                <Label>Days of Week *</Label>
                <div className="flex flex-wrap gap-2">
                  {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => (
                    <label key={day} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="days_of_week" value={day} defaultChecked={["monday", "wednesday", "friday"].includes(day)} />
                      {day.charAt(0).toUpperCase() + day.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cycle Length (weeks)</Label>
                <select name="cycle_weeks" defaultValue="2" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="1">1 week</option>
                  <option value="2">2 weeks</option>
                  <option value="3">3 weeks</option>
                  <option value="4">4 weeks</option>
                </select>
              </div>
              {createState?.error && <p className="text-sm text-destructive">{createState.error}</p>}
              <Button type="submit" className="w-full" disabled={createPending}>
                {createPending ? "Creating…" : "Create Chore"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Signoff Reviews */}
      {pendingSignoffs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Pending Chore Reviews ({pendingSignoffs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Go to the <a href="/chores" className="underline">Chores page</a> to review pending signoffs.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chore Lists with Tasks */}
      {houseChores.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">
          No chores defined for this house. Create one above.
        </p>
      ) : (
        <div className="space-y-4">
          {houseChores.map((chore) => (
            <ChoreCard key={chore.id} chore={chore} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChoreCard({ chore }: { chore: ChoreItem }) {
  const [addState, addAction, addPending] = useActionState(addChoreTask, undefined);
  const [isArchiving, startArchive] = useTransition();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{chore.name}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            disabled={isArchiving}
            onClick={() => {
              if (confirm(`Archive "${chore.name}"? It will no longer appear in rotations.`)) {
                startArchive(() => { archiveChore(chore.id); });
              }
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {chore.tasks.length > 0 && (
          <ol className="space-y-1">
            {chore.tasks.map((task, i) => (
              <ChoreTaskRow key={task.id} task={task} index={i + 1} />
            ))}
          </ol>
        )}
        <form action={addAction} className="flex items-center gap-2">
          <input type="hidden" name="chore_id" value={chore.id} />
          <Input name="description" placeholder="Add task…" required className="h-8 text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={addPending} className="h-8">
            <Plus className="h-3 w-3" />
          </Button>
        </form>
        {addState?.error && <p className="text-xs text-destructive">{addState.error}</p>}
      </CardContent>
    </Card>
  );
}

function ChoreTaskRow({ task, index }: { task: { id: string; description: string }; index: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground w-5 text-right">{index}.</span>
      <span className="flex-1">{task.description}</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive p-1"
        disabled={isPending}
        onClick={() => startTransition(() => { removeChoreTask(task.id); })}
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}

// ─── Leave Requests Tab ──────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function LeaveTab({ pendingLeave }: { pendingLeave: any[] }) {
/* eslint-enable @typescript-eslint/no-explicit-any */
  if (pendingLeave.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No pending leave requests.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Pending Leave Requests ({pendingLeave.length})</h3>
      {pendingLeave.map((lr) => {
        const resident = lr.resident as {
          full_name: string;
          house_id: string;
          houses: { name: string } | null;
        } | null;
        return (
          <Card key={lr.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-sm">{resident?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {resident?.houses?.name} &middot;{" "}
                  {new Date(lr.departure_date).toLocaleDateString()} →{" "}
                  {new Date(lr.expected_return_date).toLocaleDateString()}
                </p>
                {lr.reason && (
                  <p className="text-xs text-muted-foreground mt-1">{lr.reason}</p>
                )}
              </div>
              <LeaveActions requestId={lr.id} status={lr.status} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function LeaveActions({ requestId, status }: { requestId: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const [showDeny, setShowDeny] = useState(false);
  const [denialNote, setDenialNote] = useState("");

  if (status === "approved") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => { markLeaveReturned(requestId); })}
      >
        <RotateCcw className="mr-1 h-3 w-3" />
        {isPending ? "Saving…" : "Mark Returned"}
      </Button>
    );
  }

  // Handle multi-step approval statuses
  const isPendingStatus = status === "pending_cover" || status === "pending_manager" || status === "pending_admin";
  if (!isPendingStatus) return null;

  const stepLabel =
    status === "pending_cover" ? "Cover" :
    status === "pending_manager" ? "Manager" : "Admin";

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs">{stepLabel} Step</Badge>
      {status === "pending_admin" && (
        <>
          {showDeny ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Reason..."
                value={denialNote}
                onChange={(e) => setDenialNote(e.target.value)}
                className="w-40 h-8"
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={() => startTransition(() => { denyAdminRequest(requestId, denialNote); })}
              >
                Deny
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDeny(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                size="sm"
                variant="default"
                disabled={isPending}
                onClick={() => startTransition(() => { approveAdminRequest(requestId); })}
              >
                <Check className="mr-1 h-3 w-3" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setShowDeny(true)}
              >
                <X className="mr-1 h-3 w-3" /> Deny
              </Button>
            </>
          )}
        </>
      )}
      {status !== "pending_admin" && (
        <span className="text-xs text-muted-foreground">
          Waiting for {stepLabel.toLowerCase()} approval
        </span>
      )}
    </div>
  );
}

// ─── Demerits & Incidents Tab ────────────────────────────────

function DemeritsTab({
  houses,
  residents,
  demerits,
  incidents,
}: {
  houses: HouseItem[];
  residents: ResidentItem[];
  /* eslint-disable @typescript-eslint/no-explicit-any */
  demerits: any[];
  incidents: any[];
  /* eslint-enable @typescript-eslint/no-explicit-any */
}) {
  const [openDemerit, setOpenDemerit] = useState(false);
  const [demeritState, demeritAction, demeritPending] = useActionState(issueDemerit, undefined);
  const [openIncident, setOpenIncident] = useState(false);
  const [incidentState, incidentAction, incidentPending] = useActionState(createIncident, undefined);
  const [selectedHouse, setSelectedHouse] = useState(houses[0]?.id ?? "");

  const houseResidents = residents.filter((r) => r.house_id === selectedHouse);
  const activeDemerits = demerits.filter((d) => d.status === "active");
  const resolvedDemerits = demerits.filter((d) => d.status !== "active");

  return (
    <div className="space-y-6">
      {/* Issue Demerit + Log Incident */}
      <div className="flex items-center gap-2">
        <Dialog open={openDemerit} onOpenChange={setOpenDemerit}>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Issue Demerit
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Issue Demerit</DialogTitle>
            </DialogHeader>
            <form action={demeritAction} className="space-y-4">
              <div className="space-y-2">
                <Label>House *</Label>
                <select
                  name="house_id"
                  required
                  value={selectedHouse}
                  onChange={(e) => setSelectedHouse(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Resident *</Label>
                <select name="resident_id" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Select resident</option>
                  {houseResidents.map((r) => (
                    <option key={r.id} value={r.id}>{r.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Points *</Label>
                  <Input name="points" type="number" min={1} max={10} defaultValue={1} required />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select name="category" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="">Select…</option>
                    <option value="chore_violation">Chore Violation</option>
                    <option value="curfew_violation">Curfew Violation</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="substance">Substance</option>
                    <option value="property_damage">Property Damage</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason *</Label>
                <Textarea name="reason" required rows={3} />
              </div>
              {demeritState?.error && <p className="text-sm text-destructive">{demeritState.error}</p>}
              <Button type="submit" className="w-full" disabled={demeritPending}>
                {demeritPending ? "Issuing…" : "Issue Demerit"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={openIncident} onOpenChange={setOpenIncident}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Log Incident
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log Incident</DialogTitle>
            </DialogHeader>
            <form action={incidentAction} className="space-y-4">
              <div className="space-y-2">
                <Label>House *</Label>
                <select
                  name="house_id"
                  required
                  value={selectedHouse}
                  onChange={(e) => setSelectedHouse(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Resident *</Label>
                <select name="resident_id" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">Select resident</option>
                  {houseResidents.map((r) => (
                    <option key={r.id} value={r.id}>{r.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Severity *</Label>
                  <select name="severity" required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                    <option value="minor">Minor</option>
                    <option value="major">Major</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input name="occurred_at" type="date" required defaultValue={new Date().toISOString().split("T")[0]} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input name="category" placeholder="e.g. curfew, substance, conflict" />
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea name="description" required rows={3} />
              </div>
              {incidentState?.error && <p className="text-sm text-destructive">{incidentState.error}</p>}
              <Button type="submit" className="w-full" disabled={incidentPending}>
                {incidentPending ? "Logging…" : "Log Incident"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Demerits */}
      <div>
        <h3 className="font-semibold text-sm mb-3">
          Active Demerits ({activeDemerits.length})
        </h3>
        {activeDemerits.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active demerits.</p>
        ) : (
          <div className="space-y-2">
            {activeDemerits.map((d) => (
              <DemeritCard key={d.id} demerit={d} />
            ))}
          </div>
        )}
      </div>

      {/* Resolved Demerits */}
      {resolvedDemerits.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3">
            Resolved Demerits ({resolvedDemerits.length})
          </h3>
          <div className="space-y-2">
            {resolvedDemerits.slice(0, 10).map((d) => (
              <DemeritCard key={d.id} demerit={d} resolved />
            ))}
          </div>
        </div>
      )}

      {/* Recent Incidents */}
      <div>
        <h3 className="font-semibold text-sm mb-3">
          Recent Incidents ({incidents.length})
        </h3>
        {incidents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No incidents logged.</p>
        ) : (
          <div className="space-y-2">
            {incidents.map((inc) => (
              <Card key={inc.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {(inc.resident as { full_name: string } | null)?.full_name}
                        </p>
                        <Badge
                          variant={
                            inc.severity === "critical"
                              ? "destructive"
                              : inc.severity === "major"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-xs"
                        >
                          {inc.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(inc.house as { name: string } | null)?.name} &middot;{" "}
                        {new Date(inc.occurred_at).toLocaleDateString()}
                        {inc.category && ` · ${inc.category}`}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm mt-2">{inc.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function DemeritCard({ demerit: d, resolved }: { demerit: any; resolved?: boolean }) {
/* eslint-enable @typescript-eslint/no-explicit-any */
  const [resolveState, resolveAction, resolvePending] = useActionState(resolveDemerit, undefined);
  const [showResolve, setShowResolve] = useState(false);

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm">
                {(d.resident as { full_name: string } | null)?.full_name}
              </p>
              <Badge variant={resolved ? "outline" : "destructive"} className="text-xs">
                {d.points} pt{d.points > 1 ? "s" : ""}
              </Badge>
              {d.category && (
                <Badge variant="outline" className="text-xs capitalize">
                  {d.category.replace(/_/g, " ")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(d.house as { name: string } | null)?.name} &middot;{" "}
              {new Date(d.created_at).toLocaleDateString()} &middot;{" "}
              Issued by {(d.issuer as { full_name: string } | null)?.full_name}
            </p>
          </div>
          {!resolved && !showResolve && (
            <Button size="sm" variant="outline" onClick={() => setShowResolve(true)}>
              Resolve
            </Button>
          )}
        </div>
        <p className="text-sm mt-2">{d.reason}</p>
        {d.resolution_note && (
          <p className="text-xs text-muted-foreground mt-1">
            Resolution: {d.resolution_note}
          </p>
        )}
        {showResolve && (
          <form action={resolveAction} className="mt-3 flex items-end gap-2">
            <input type="hidden" name="demerit_id" value={d.id} />
            <div className="flex-1">
              <Input name="resolution_note" placeholder="Resolution note (optional)" className="h-8 text-sm" />
            </div>
            <Button type="submit" size="sm" disabled={resolvePending}>
              {resolvePending ? "…" : "Resolve"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowResolve(false)}>
              Cancel
            </Button>
          </form>
        )}
        {resolveState?.error && <p className="text-xs text-destructive mt-1">{resolveState.error}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Users & Roles Tab (Admin only) ─────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function UsersTab({ users, houses }: { users: any[]; houses: HouseItem[] }) {
/* eslint-enable @typescript-eslint/no-explicit-any */
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">All Users ({users.length})</h3>
      {users.map((u) => {
        const roleRaw = u.user_roles;
        const role = Array.isArray(roleRaw)
          ? (roleRaw as Array<{ role: string }>)[0]?.role ?? "resident"
          : (roleRaw as { role: string } | null)?.role ?? "resident";
        const activeAssignments = (
          u.manager_house_assignments as Array<{
            house_id: string;
            houses: { name: string } | null;
            unassigned_at: string | null;
          }>
        )?.filter((a) => !a.unassigned_at) ?? [];

        return (
          <Card key={u.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{u.full_name}</p>
                  <Badge
                    variant={
                      role === "admin"
                        ? "default"
                        : role === "manager"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-xs capitalize"
                  >
                    {role}
                  </Badge>
                  {!u.is_active && (
                    <Badge variant="destructive" className="text-xs">Inactive</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                {activeAssignments.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Houses: {activeAssignments.map((a) => a.houses?.name).join(", ")}
                  </p>
                )}
              </div>
              <UserActionMenu
                userId={u.id}
                currentRole={role}
                houses={houses.map((h) => ({ id: h.id, name: h.name }))}
                assignedHouseIds={activeAssignments.map((a) => a.house_id)}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function UserActionMenu({
  userId,
  currentRole,
  houses,
  assignedHouseIds,
}: {
  userId: string;
  currentRole: string;
  houses: { id: string; name: string }[];
  assignedHouseIds: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [showHouseAssign, setShowHouseAssign] = useState(false);
  const [assignState, assignAction, assignPending] = useActionState(assignManagerToHouses, undefined);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {currentRole !== "admin" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => startTransition(() => { changeUserRole(userId, "admin"); })}
            >
              Promote to Admin
            </DropdownMenuItem>
          )}
          {currentRole !== "manager" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => startTransition(async () => {
                await changeUserRole(userId, "manager");
                setShowHouseAssign(true);
              })}
            >
              Set as Manager
            </DropdownMenuItem>
          )}
          {currentRole !== "resident" && (
            <DropdownMenuItem
              disabled={isPending}
              onClick={() => startTransition(() => { changeUserRole(userId, "resident"); })}
            >
              Set as Resident
            </DropdownMenuItem>
          )}
          {(currentRole === "manager" || currentRole === "admin") && (
            <DropdownMenuItem onClick={() => setShowHouseAssign(true)}>
              Assign Houses
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            disabled={isPending}
            onClick={() => {
              if (confirm("Deactivate this user? They will lose access.")) {
                startTransition(() => { deactivateUser(userId); });
              }
            }}
          >
            Deactivate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showHouseAssign} onOpenChange={setShowHouseAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Houses</DialogTitle>
          </DialogHeader>
          <form action={assignAction} className="space-y-4">
            <input type="hidden" name="user_id" value={userId} />
            <div className="space-y-2">
              {houses.map((house) => (
                <label key={house.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="house_ids"
                    value={house.id}
                    defaultChecked={assignedHouseIds.includes(house.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  {house.name}
                </label>
              ))}
            </div>
            {assignState?.error && <p className="text-sm text-destructive">{assignState.error}</p>}
            <Button type="submit" className="w-full" disabled={assignPending}>
              {assignPending ? "Saving…" : "Save Assignments"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Payments Tab ────────────────────────────────────────────

// ─── Payments helpers ───────────────────────────────────────
//
// Charge rows come straight from Supabase as `any[]` because Supabase
// nested selects don't play nicely with TS narrowing in this file
// (everything else in this module is typed the same way). The admin
// tab only needs a small subset of the full charge record — we cast
// to this local shape at the top of each render path so the downstream
// JSX has typed access.
interface OpenChargeRow {
  id: string;
  resident_id: string;
  house_id: string;
  charge_type: string;
  amount: number;
  paid_amount: number | null;
  due_date: string; // YYYY-MM-DD
  period_start: string | null;
  period_end: string | null;
  status: string;
  resident: { full_name: string } | null;
  house: { name: string } | null;
}

interface RecentPaymentRow {
  id: string;
  amount: number;
  payment_type: string;
  payment_method: string | null;
  paid_at: string;
  status: string;
  receipt_number: string | null;
  receipt_storage_path: string | null;
  resident: { full_name: string } | null;
  house: { name: string } | null;
}

function chargeTypeLabel(t: string) {
  switch (t) {
    case "rent":
      return "Rent";
    case "admin_fee":
      return "Admin Fee";
    case "deposit":
      return "Deposit";
    case "fee":
      return "Fee";
    case "late_fee":
      return "Late Fee";
    default:
      return t.replace(/_/g, " ");
  }
}

function formatChargeDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PaymentsTab({
  houses,
  residents,
  openCharges,
  recentPayments,
}: {
  houses: HouseItem[];
  residents: ResidentItem[];
  openCharges: OpenChargeRow[];
  recentPayments: RecentPaymentRow[];
}) {
  const todayIso = todayLocalIso();
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekAheadIso = `${weekAhead.getFullYear()}-${String(
    weekAhead.getMonth() + 1
  ).padStart(2, "0")}-${String(weekAhead.getDate()).padStart(2, "0")}`;
  const monthStartNow = new Date();
  const monthStartIso = `${monthStartNow.getFullYear()}-${String(
    monthStartNow.getMonth() + 1
  ).padStart(2, "0")}-01`;

  // Bucket open charges by urgency so the summary tiles + the list
  // groups read off the same filtered arrays (no duplicate logic).
  const pastDue = openCharges.filter((c) => c.due_date < todayIso);
  const dueThisWeek = openCharges.filter(
    (c) => c.due_date >= todayIso && c.due_date <= weekAheadIso
  );
  const upcoming = openCharges.filter((c) => c.due_date > weekAheadIso);

  const outstandingTotal = (charges: OpenChargeRow[]) =>
    charges.reduce(
      (sum, c) => sum + (Number(c.amount) - Number(c.paid_amount ?? 0)),
      0
    );

  const paidThisMonth = recentPayments.filter(
    (p) =>
      p.paid_at >= monthStartIso &&
      p.status !== "void" &&
      p.status !== "refunded"
  );
  const paidThisMonthTotal = paidThisMonth.reduce(
    (sum, p) => sum + Number(p.amount ?? 0),
    0
  );

  // Pull just the open charges needed by CreatePaymentDialog. The
  // dialog does its own filtering by resident but only needs id + the
  // identifying fields, so we pass the whole list as-is.
  const dialogCharges = openCharges.map((c) => ({
    id: c.id,
    resident_id: c.resident_id,
    house_id: c.house_id,
    amount: Number(c.amount),
    paid_amount: Number(c.paid_amount ?? 0),
    due_date: c.due_date,
    period_start: c.period_start,
    period_end: c.period_end,
    charge_type: c.charge_type,
  }));

  return (
    <div className="space-y-6">
      {/* Summary strip — same three tiles staff need to answer
          "who's behind / who's due soon / how much came in this month"
          without leaving the admin panel. */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <PaymentSummaryTile
          label="Past Due"
          count={pastDue.length}
          total={outstandingTotal(pastDue)}
          tone="destructive"
        />
        <PaymentSummaryTile
          label="Due This Week"
          count={dueThisWeek.length}
          total={outstandingTotal(dueThisWeek)}
          tone="warning"
        />
        <PaymentSummaryTile
          label="Paid This Month"
          count={paidThisMonth.length}
          total={paidThisMonthTotal}
          tone="success"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-base">Open Balances</h3>
        <div className="flex items-center gap-2">
          <CreatePaymentDialog
            houses={houses.map((h) => ({ id: h.id, name: h.name }))}
            residents={residents.map((r) => ({
              id: r.id,
              full_name: r.full_name,
              house_id: r.house_id,
            }))}
            openCharges={dialogCharges}
          />
          <Link
            href="/payments"
            className="inline-flex items-center h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Full ledger →
          </Link>
        </div>
      </div>

      <ChargeGroup title="Past Due" tone="destructive" charges={pastDue} />
      <ChargeGroup title="Due This Week" tone="warning" charges={dueThisWeek} />
      <ChargeGroup
        title="Upcoming"
        tone="muted"
        charges={upcoming}
        emptyHint="No upcoming charges on file."
      />

      {/* Recently Paid — five most recent actually-paid rows with an
          inline Download Receipt so staff can resend a receipt on the
          spot without bouncing through /payments. */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Recently Paid</h3>
        {recentPayments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No payments recorded yet.
          </p>
        ) : (
          <div className="space-y-2">
            {recentPayments.slice(0, 5).map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      ${Number(p.amount).toFixed(2)} — {p.resident?.full_name ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.house?.name} · {chargeTypeLabel(p.payment_type)} ·{" "}
                      {new Date(p.paid_at).toLocaleDateString()}
                      {p.receipt_number ? ` · ${p.receipt_number}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <DownloadReceiptButton
                      storagePath={p.receipt_storage_path}
                      receiptNumber={p.receipt_number}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaymentSummaryTile({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "destructive" | "warning" | "success";
}) {
  const border =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warning"
      ? "border-amber-300 bg-amber-50"
      : "border-emerald-300 bg-emerald-50";
  const labelTone =
    tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
      ? "text-amber-800"
      : "text-emerald-800";
  return (
    <Card className={border}>
      <CardContent className="py-3">
        <p className={`text-xs font-medium ${labelTone}`}>{label}</p>
        <p className="text-2xl font-bold mt-0.5">
          ${total.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {count} {count === 1 ? "charge" : "charges"}
        </p>
      </CardContent>
    </Card>
  );
}

function ChargeGroup({
  title,
  tone,
  charges,
  emptyHint,
}: {
  title: string;
  tone: "destructive" | "warning" | "muted";
  charges: OpenChargeRow[];
  emptyHint?: string;
}) {
  if (charges.length === 0 && !emptyHint) return null;
  const badgeTone =
    tone === "destructive"
      ? "destructive"
      : tone === "warning"
      ? "secondary"
      : "outline";
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <Badge variant={badgeTone} className="h-5 px-1.5 text-xs">
          {charges.length}
        </Badge>
      </div>
      {charges.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          {emptyHint ?? "None."}
        </p>
      ) : (
        <div className="space-y-2">
          {charges.slice(0, 8).map((c) => {
            const remaining =
              Number(c.amount) - Number(c.paid_amount ?? 0);
            return (
              <Card key={c.id}>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {c.resident?.full_name ?? "—"} · ${remaining.toFixed(2)}
                      {c.status === "partial" && (
                        <span className="text-xs text-muted-foreground font-normal">
                          {" "}· partial
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.house?.name} · {chargeTypeLabel(c.charge_type)} · due{" "}
                      {formatChargeDate(c.due_date)}
                    </p>
                  </div>
                  <Badge
                    variant={badgeTone}
                    className="text-xs capitalize flex-none"
                  >
                    {c.status}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
          {charges.length > 8 && (
            <p className="text-xs text-muted-foreground pt-1">
              +{charges.length - 8} more — see{" "}
              <Link href="/payments" className="underline">
                full ledger
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
