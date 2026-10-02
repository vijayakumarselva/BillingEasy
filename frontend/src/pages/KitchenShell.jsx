// The entire app, for a kitchen login. One screen, no sidebar, nothing to
// wander into: the orders to cook, the outlet name, and a way out.
import { useAuth } from "@/context/AuthContext";
import KitchenDisplay from "@/pages/KitchenDisplay";
import { ChefHat, LogOut } from "lucide-react";

export default function KitchenShell() {
  const { currentOrg, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <ChefHat className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold leading-tight truncate">{currentOrg?.name || "Kitchen"}</p>
            <p className="text-[11px] text-white/50 leading-tight">
              {user?.name || "Kitchen"} · kitchen screen
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1.5 px-3 py-2"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </header>
      <main className="p-4">
        <KitchenDisplay embedded />
      </main>
    </div>
  );
}
