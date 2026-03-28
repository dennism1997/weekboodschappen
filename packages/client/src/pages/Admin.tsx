import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {apiFetch} from "../api/client.js";
import {Activity, ChevronDown, ChevronUp, RotateCcw, Shield, Trash2, Users} from "lucide-react";

interface HouseholdMember {
  id: string;
  name: string;
  role: string;
}

interface Household {
  id: string;
  name: string;
  status: string;
  createdAt: number;
  memberCount: number;
  recipeCount: number;
  lastActivity: string | null;
  members: HouseholdMember[];
}

interface UserMembership {
  organizationId: string;
  role: string;
  householdName: string;
}

interface AdminUser {
  id: string;
  name: string;
  createdAt: number;
  memberships: UserMembership[];
  lastLogin: number | null;
}

interface SystemHealth {
  dbSizeBytes: number;
  dbSizeMB: number;
  discountLastRefresh: string | null;
  aiCallCount: number;
}

export default function Admin() {
  const queryClient = useQueryClient();
  const [expandedHousehold, setExpandedHousehold] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: households = [], isLoading: loadingHouseholds } = useQuery({
    queryKey: ["admin-households"],
    queryFn: () => apiFetch<Household[]>("/admin/households"),
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch<AdminUser[]>("/admin/users"),
  });

  const { data: system } = useQuery({
    queryKey: ["admin-system"],
    queryFn: () => apiFetch<SystemHealth>("/admin/system"),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/admin/households/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-households"] });
    },
  });

  const deleteHousehold = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/households/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-households"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDelete(null);
    },
  });

  const resetPasskey = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/admin/users/${id}/reset-passkey`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const removeMembership = useMutation({
    mutationFn: ({ userId, orgId }: { userId: string; orgId: string }) =>
      apiFetch(`/admin/users/${userId}/membership/${orgId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-households"] });
    },
  });

  const pendingHouseholds = households.filter((h) => h.status === "waiting");
  const otherHouseholds = households.filter((h) => h.status !== "waiting");

  const timeAgo = (date: number | string | null) => {
    if (!date) return "Nooit";
    const ms = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m geleden`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}u geleden`;
    const days = Math.floor(hours / 24);
    return `${days}d geleden`;
  };

  if (loadingHouseholds || loadingUsers) {
    return (
      <div className="flex h-full items-center justify-center text-ios-secondary">
        Laden...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Shield size={20} strokeWidth={1.5} />
        <h1 className="text-[22px] font-bold text-ios-label">Admin</h1>
      </div>

      {/* Pending Approval */}
      {pendingHouseholds.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-ios-label">
              Wachten op goedkeuring
            </h2>
            <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[13px] font-medium text-amber-500">
              {pendingHouseholds.length}
            </span>
          </div>
          <div className="space-y-2">
            {pendingHouseholds.map((h) => (
              <div
                key={h.id}
                className="rounded-[12px] bg-ios-grouped-bg p-3"
              >
                <div className="mb-2">
                  <div className="font-medium text-ios-label">{h.name}</div>
                  <div className="text-[12px] text-ios-secondary">
                    {timeAgo(h.createdAt)} · {h.memberCount} {h.memberCount === 1 ? "lid" : "leden"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateStatus.mutate({ id: h.id, status: "active" })}
                    disabled={updateStatus.isPending}
                    className="flex-1 rounded-[10px] bg-green-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Goedkeuren
                  </button>
                  <button
                    onClick={() => deleteHousehold.mutate(h.id)}
                    disabled={deleteHousehold.isPending}
                    className="flex-1 rounded-[10px] bg-ios-destructive px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Afwijzen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Households */}
      <section>
        <h2 className="mb-2 text-[17px] font-semibold text-ios-label">
          Huishoudens ({otherHouseholds.length})
        </h2>
        <div className="space-y-2">
          {otherHouseholds.map((h) => (
            <div
              key={h.id}
              className={`rounded-[12px] bg-ios-grouped-bg ${h.status === "deactivated" ? "opacity-50" : ""}`}
            >
              <button
                onClick={() =>
                  setExpandedHousehold(expandedHousehold === h.id ? null : h.id)
                }
                className="flex w-full items-center justify-between p-3 text-left"
              >
                <div>
                  <div className="font-medium text-ios-label">{h.name}</div>
                  <div className="text-[12px] text-ios-secondary">
                    {h.memberCount} {h.memberCount === 1 ? "lid" : "leden"} ·{" "}
                    {h.recipeCount} recepten · Actief: {timeAgo(h.lastActivity)}
                  </div>
                </div>
                {expandedHousehold === h.id ? (
                  <ChevronUp size={16} className="text-ios-secondary" />
                ) : (
                  <ChevronDown size={16} className="text-ios-secondary" />
                )}
              </button>

              {expandedHousehold === h.id && (
                <div className="border-t border-ios-separator px-3 pb-3 pt-2">
                  <div className="mb-2 text-[13px] text-ios-secondary">Leden:</div>
                  {h.members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between py-1 text-[13px]"
                    >
                      <span className="text-ios-label">{m.name}</span>
                      <span className="text-ios-secondary">{m.role}</span>
                    </div>
                  ))}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() =>
                        updateStatus.mutate({
                          id: h.id,
                          status: h.status === "active" ? "deactivated" : "active",
                        })
                      }
                      disabled={updateStatus.isPending}
                      className="flex-1 rounded-[10px] bg-ios-grouped-bg border border-ios-separator px-3 py-2 text-[13px] font-medium text-ios-label disabled:opacity-50"
                    >
                      {h.status === "active" ? "Deactiveren" : "Activeren"}
                    </button>
                    {confirmDelete === h.id ? (
                      <button
                        onClick={() => deleteHousehold.mutate(h.id)}
                        disabled={deleteHousehold.isPending}
                        className="flex-1 rounded-[10px] bg-ios-destructive px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        Bevestigen
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(h.id)}
                        className="rounded-[10px] px-3 py-2 text-[13px] text-ios-destructive"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Users */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Users size={16} strokeWidth={1.5} />
          <h2 className="text-[17px] font-semibold text-ios-label">
            Gebruikers ({users.length})
          </h2>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="rounded-[12px] bg-ios-grouped-bg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ios-label">{u.name}</div>
                  <div className="text-[12px] text-ios-secondary">
                    {u.memberships.map((m) => m.householdName).join(", ") || "Geen huishouden"}{" "}
                    · Laatst ingelogd: {timeAgo(u.lastLogin)}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => resetPasskey.mutate(u.id)}
                  disabled={resetPasskey.isPending}
                  className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] text-ios-secondary"
                >
                  <RotateCcw size={12} /> Reset passkey
                </button>
                {u.memberships.map((m) => (
                  <button
                    key={m.organizationId}
                    onClick={() =>
                      removeMembership.mutate({
                        userId: u.id,
                        orgId: m.organizationId,
                      })
                    }
                    disabled={removeMembership.isPending}
                    className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] text-ios-destructive"
                  >
                    <Trash2 size={12} /> {m.householdName}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* System Health */}
      {system && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Activity size={16} strokeWidth={1.5} />
            <h2 className="text-[17px] font-semibold text-ios-label">Systeem</h2>
          </div>
          <div className="rounded-[12px] bg-ios-grouped-bg p-3 text-[13px] text-ios-label">
            <div className="flex justify-between py-1">
              <span className="text-ios-secondary">Database</span>
              <span>{system.dbSizeMB} MB</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ios-secondary">Kortingen vernieuwd</span>
              <span>
                {system.discountLastRefresh
                  ? new Date(system.discountLastRefresh).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Nooit"}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ios-secondary">AI-aanroepen</span>
              <span>{system.aiCallCount}</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
