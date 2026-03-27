import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav.js";

export default function Layout() {
  return (
    <div className="min-h-screen bg-ios-bg pb-24">
      <main className="mx-auto max-w-lg px-4 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
