import { useAuth } from "../hooks/useAuth.js";
import { useNavigate } from "react-router-dom";

export default function Waiting() {
  const { authenticated, loading, household } = useAuth();
  const navigate = useNavigate();

  const handleRefresh = () => {
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-ios-secondary">
        Laden...
      </div>
    );
  }

  if (!authenticated) {
    navigate("/login", { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="text-6xl">⏳</div>
        <h1 className="text-[22px] font-bold text-ios-label">
          Wachten op goedkeuring
        </h1>
        <p className="text-[15px] text-ios-secondary">
          Je huishouden{household ? ` "${household.name}"` : ""} is aangemeld en
          wacht op goedkeuring van de beheerder.
        </p>
        <button
          onClick={handleRefresh}
          className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white"
        >
          Opnieuw controleren
        </button>
      </div>
    </div>
  );
}
