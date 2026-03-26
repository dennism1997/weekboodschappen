import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/planner", label: "Plan", icon: "📅" },
  { to: "/list", label: "Lijst", icon: "📝" },
  { to: "/recipes", label: "Recepten", icon: "📖" },
  { to: "/staples", label: "Basis", icon: "🛒" },
  { to: "/settings", label: "Instellingen", icon: "⚙️" },
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-lg justify-around">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center px-2 py-2 text-xs ${
                isActive
                  ? "text-green-600 font-semibold"
                  : "text-gray-500"
              }`
            }
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
