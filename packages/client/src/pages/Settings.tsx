import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../api/client";
import { authClient } from "../lib/auth-client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Member {
  id: string;
  name: string;
}

const STORES = ["Jumbo", "Albert Heijn"];

const DEFAULT_CATEGORIES = [
  "Groente & Fruit",
  "Brood & Bakkerij",
  "Zuivel & Eieren",
  "Kaas",
  "Vlees & Vis",
  "Vega & Vegan",
  "Diepvries",
  "Pasta, Rijst & Wereldkeuken",
  "Soepen, Sauzen & Kruiden",
  "Conserven & Houdbaar",
  "Chips, Noten & Snacks",
  "Snoep & Chocolade",
  "Koek & Gebak",
  "Ontbijtgranen & Beleg",
  "Dranken",
  "Koffie & Thee",
  "Huishouden & Schoonmaak",
  "Persoonlijke Verzorging",
  "Baby & Kind",
  "Overig",
];

function storeToApiName(displayName: string): string {
  if (displayName === "Albert Heijn") return "albert_heijn";
  return displayName.toLowerCase();
}

function SortableItem({ id }: { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex min-h-[44px] items-center gap-3 rounded-[10px] border px-4 py-3 text-[15px] ${
        isDragging
          ? "z-10 border-accent bg-accent-light shadow-md"
          : "border-ios-separator bg-white"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-ios-tertiary select-none"
        aria-label="Versleep"
      >
        ≡
      </span>
      <span className="text-ios-label">{id}</span>
    </li>
  );
}

export default function Settings() {
  const { user, household, signOut } = useAuth();
  const [store, setStore] = useState("Jumbo");
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [recoveryUrl, setRecoveryUrl] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const { data: members = [] } = useQuery({
    queryKey: ["members", household?.id],
    queryFn: async () => {
      const result = await authClient.organization.getFullOrganization();
      if (result.data) {
        return result.data.members.map((m: any) => ({
          id: m.user.id,
          name: m.user.name || m.user.email,
        })) as Member[];
      }
      return [] as Member[];
    },
    enabled: !!household,
  });

  const { data: storeConfigs = {} } = useQuery({
    queryKey: ["store-configs"],
    queryFn: () => apiFetch<Record<string, string[]>>("/stores/config"),
  });

  // Update categories when store or configs change
  useEffect(() => {
    const apiName = storeToApiName(store);
    const categoryOrder = storeConfigs[apiName];
    if (categoryOrder && categoryOrder.length > 0) {
      setCategories(categoryOrder);
    } else {
      setCategories(DEFAULT_CATEGORIES);
    }
  }, [store, storeConfigs]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setCategories((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        const newOrder = arrayMove(prev, oldIndex, newIndex);

        // Save to server
        const apiName = storeToApiName(store);
        apiFetch(`/stores/config/${apiName}`, {
          method: "PUT",
          body: JSON.stringify({ categoryOrder: newOrder }),
        }).catch(() => {
          // ignore
        });

        return newOrder;
      });
    },
    [store],
  );

  const resetCategoryOrder = async () => {
    setCategories(DEFAULT_CATEGORIES);
    const apiName = storeToApiName(store);
    try {
      await apiFetch(`/stores/config/${apiName}`, {
        method: "PUT",
        body: JSON.stringify({ categoryOrder: DEFAULT_CATEGORIES }),
      });
    } catch {
      // ignore
    }
  };

  const updateStore = (newStore: string) => {
    setStore(newStore);
  };

  const createInviteLink = async () => {
    setCreatingInvite(true);
    try {
      const res = await apiFetch<{ url: string }>("/invite/create", { method: "POST" });
      setInviteUrl(res.url);
      await navigator.clipboard.writeText(res.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const resetMemberPasskey = async (memberId: string) => {
    setResettingUserId(memberId);
    try {
      const res = await apiFetch<{ url: string }>("/recovery/create", {
        method: "POST",
        body: JSON.stringify({ userId: memberId }),
      });
      setRecoveryUrl(res.url);
      await navigator.clipboard.writeText(res.url);
    } catch {
      // ignore
    } finally {
      setResettingUserId("");
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <div>
      <h1 className="mb-4 text-[34px] font-bold text-ios-label">Instellingen</h1>

      {/* Household info */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Huishouden</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white">
        <div className="flex min-h-[44px] items-center justify-between px-4 py-3">
          <span className="text-[17px] text-ios-label">Naam</span>
          <span className="text-[17px] text-ios-secondary">
            {household?.name || "\u2014"}
          </span>
        </div>
        <div className="ml-4 flex min-h-[44px] items-center justify-between border-t border-ios-separator py-3 pr-4">
          <span className="text-[17px] text-ios-label">Uitnodiging</span>
          {inviteUrl ? (
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1 rounded-[8px] bg-ios-category-bg px-3 py-1 font-mono text-[13px] text-ios-label"
            >
              <span className="max-w-[140px] truncate">{inviteUrl}</span>
              <span className="text-[11px] text-ios-secondary">
                {copied ? "Gekopieerd!" : "Kopieer"}
              </span>
            </button>
          ) : (
            <button
              onClick={createInviteLink}
              disabled={creatingInvite}
              className="rounded-[8px] bg-accent px-3 py-1 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {creatingInvite ? "Bezig..." : "Link maken"}
            </button>
          )}
        </div>
        <div className="ml-4 flex min-h-[44px] items-center justify-between border-t border-ios-separator py-3 pr-4">
          <span className="text-[17px] text-ios-label">Ingelogd als</span>
          <span className="text-[17px] text-ios-secondary">
            {user?.name || user?.email || "\u2014"}
          </span>
        </div>
      </section>

      {/* Preferred store */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Voorkeurswinkel</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white p-4">
        <div className="flex rounded-[9px] bg-ios-segmented-bg p-0.5">
          {STORES.map((s) => (
            <button
              key={s}
              onClick={() => updateStore(s)}
              className={`flex-1 rounded-[7px] py-[7px] text-[13px] font-semibold transition ${
                store === s
                  ? "bg-white text-ios-label shadow-sm"
                  : "text-ios-label"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Members */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Leden</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white">
        {members.length === 0 ? (
          <p className="px-4 py-3 text-[15px] text-ios-tertiary">Laden...</p>
        ) : (
          members.map((m, idx) => (
            <div
              key={m.id}
              className={`flex min-h-[44px] items-center gap-3 px-4 py-3 ${
                idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-light text-[13px] font-semibold text-accent">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="text-[17px] text-ios-label">
                {m.name}{m.id === user?.id && " (jij)"}
              </span>
              {m.id !== user?.id && (
                <button
                  onClick={() => resetMemberPasskey(m.id)}
                  disabled={resettingUserId === m.id}
                  className="ml-auto rounded-[8px] bg-ios-category-bg px-3 py-1 text-[13px] text-ios-secondary"
                >
                  {resettingUserId === m.id ? "Bezig..." : "Reset passkey"}
                </button>
              )}
            </div>
          ))
        )}
      </section>

      {recoveryUrl && (
        <div className="mb-6 rounded-[12px] bg-accent-light p-4">
          <p className="text-[13px] font-semibold text-ios-label">Herstellink gekopieerd!</p>
          <p className="mt-1 break-all font-mono text-[12px] text-ios-secondary">{recoveryUrl}</p>
          <p className="mt-2 text-[12px] text-ios-tertiary">Stuur deze link naar het lid. De link is 1 uur geldig.</p>
          <button onClick={() => setRecoveryUrl("")} className="mt-2 text-[13px] text-accent">
            Sluiten
          </button>
        </div>
      )}

      {/* Category ordering */}
      <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Categorievolgorde</p>
      <section className="mb-6 overflow-hidden rounded-[12px] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] text-ios-secondary">
            Sleep categorie&euml;n om de volgorde aan te passen voor{" "}
            <span className="font-semibold text-ios-label">{store}</span>.
          </p>
          <button
            onClick={resetCategoryOrder}
            className="rounded-[8px] bg-ios-category-bg px-3 py-1 text-[13px] text-ios-secondary"
          >
            Reset
          </button>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {categories.map((category) => (
                <SortableItem key={category} id={category} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full rounded-[14px] border border-ios-destructive py-3 text-[15px] font-medium text-ios-destructive"
      >
        Uitloggen
      </button>
    </div>
  );
}
