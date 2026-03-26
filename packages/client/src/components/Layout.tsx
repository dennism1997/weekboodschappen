import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav.js";

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <main className="mx-auto max-w-lg px-4 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
