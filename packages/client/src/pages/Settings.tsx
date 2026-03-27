import { useState, useEffect, useCallback } from "react";
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
      className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
        isDragging
          ? "z-10 border-green-300 bg-green-50 shadow-md"
          : "border-gray-200 bg-white"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-gray-400 select-none"
        aria-label="Versleep"
      >
        ≡
      </span>
      <span className="text-gray-700">{id}</span>
    </li>
  );
}

export default function Settings() {
  const { user, household, signOut } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [store, setStore] = useState("Jumbo");
  const [copied, setCopied] = useState(false);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [storeConfigs, setStoreConfigs] = useState<Record<string, string[]>>({});

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    async function fetchMembers() {
      if (!household) return;
      try {
        const result = await authClient.organization.getFullOrganization();
        if (result.data) {
          setMembers(
            result.data.members.map((m: any) => ({
              id: m.user.id,
              name: m.user.name || m.user.email,
            })),
          );
        }
      } catch {
        // ignore
      }
    }
    fetchMembers();
  }, [household]);

  // Fetch store configs on mount
  useEffect(() => {
    async function fetchStoreConfigs() {
      try {
        const configs = await apiFetch<Record<string, string[]>>("/stores/config");
        setStoreConfigs(configs);
      } catch {
        // ignore
      }
    }
    fetchStoreConfigs();
  }, []);

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

  const copyInviteLink = async () => {
    if (!household?.slug) return;
    try {
      await navigator.clipboard.writeText(household.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-gray-900">Instellingen</h1>

      {/* Household info */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Huishouden
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Naam</span>
            <span className="font-medium text-gray-900">
              {household?.name || "\u2014"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Uitnodiging</span>
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
            >
              {household?.slug || "\u2014"}
              <span className="text-[10px] text-gray-400">
                {copied ? "Gekopieerd!" : "Kopieer"}
              </span>
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ingelogd als</span>
            <span className="font-medium text-gray-900">
              {user?.name || user?.email || "\u2014"}
            </span>
          </div>
        </div>
      </section>

      {/* Preferred store */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Voorkeurswinkel
        </h2>
        <div className="flex gap-2">
          {STORES.map((s) => (
            <button
              key={s}
              onClick={() => updateStore(s)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                store === s
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Members */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Leden</h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400">Laden...</p>
        ) : (
          <ul className="space-y-1">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-700">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                {m.name}
                {m.id === user?.id && (
                  <span className="text-xs text-gray-400">(jij)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Category ordering */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Categorievolgorde
          </h2>
          <button
            onClick={resetCategoryOrder}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
          >
            Reset
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          Sleep categorie&euml;n om de volgorde aan te passen voor{" "}
          <span className="font-medium text-gray-600">{store}</span>.
        </p>
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
        className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Uitloggen
      </button>
    </div>
  );
}
