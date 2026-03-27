import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-[34px] font-bold text-ios-label">404</h1>
        <p className="text-[15px] text-ios-secondary">Pagina niet gevonden.</p>
        <button
          onClick={() => navigate("/")}
          className="rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white"
        >
          Naar home
        </button>
      </div>
    </div>
  );
}
