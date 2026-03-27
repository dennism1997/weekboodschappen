import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.js";
import Layout from "./components/Layout.js";
import MealPlanner from "./pages/MealPlanner.js";
import GroceryList from "./pages/GroceryList.js";
import ShoppingMode from "./pages/ShoppingMode.js";
import Staples from "./pages/Staples.js";
import Recipes from "./pages/Recipes.js";
import RecipeDetail from "./pages/RecipeDetail.js";
import Settings from "./pages/Settings.js";
import Login from "./pages/Login.js";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-ios-secondary">Laden...</div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/planner" replace />} />
        <Route path="/planner" element={<MealPlanner />} />
        <Route path="/list" element={<GroceryList />} />
        <Route path="/shop" element={<ShoppingMode />} />
        <Route path="/staples" element={<Staples />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<RecipeDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
