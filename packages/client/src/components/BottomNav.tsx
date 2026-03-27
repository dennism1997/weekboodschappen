import { NavLink } from "react-router-dom";
import { Calendar, ClipboardCheck, BookOpen, ShoppingCart, Settings } from "lucide-react";

const navItems = [
  { to: "/planner", label: "Plan", icon: Calendar },
  { to: "/list", label: "Lijst", icon: ClipboardCheck },
  { to: "/recipes", label: "Recepten", icon: BookOpen },
  { to: "/staples", label: "Basis", icon: ShoppingCart },
  { to: "/settings", label: "Instellingen", icon: Settings },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-ios-separator bg-[rgba(249,249,249,0.94)] backdrop-blur-[20px]"
         style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
      <div className="mx-auto flex max-w-lg justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 pt-2 pb-1 text-[10px] font-medium ${
                isActive ? "text-accent" : "text-ios-secondary"
              }`
            }
          >
            <item.icon size={24} strokeWidth={1.5} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
