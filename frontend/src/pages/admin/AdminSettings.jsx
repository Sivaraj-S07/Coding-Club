import { useState } from "react";
import { Save, Info } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/Toast";
import { useAdminAuth } from "../../lib/adminAuth";

const inputClass =
  "glass w-full rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-700 outline-none focus:border-electric/40 disabled:opacity-60";

export default function AdminSettings() {
  const { push } = useToast();
  const { admin } = useAdminAuth();
  const [toggles, setToggles] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("quizapp_admin_prefs")) || {
          emailNotifs: true,
          publicResultsDefault: true,
          strictProctoringDefault: false,
        }
      );
    } catch {
      return { emailNotifs: true, publicResultsDefault: true, strictProctoringDefault: false };
    }
  });

  const saveLocalPrefs = () => {
    localStorage.setItem("quizapp_admin_prefs", JSON.stringify(toggles));
    push("Preferences saved to this browser.", "success");
  };

  return (
    <AdminLayout title="Settings" subtitle="Account details and portal preferences">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-panel p-6">
          <h3 className="font-display text-sm font-semibold text-ink-100">Account</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-500">Admin email</label>
              <input value={admin?.email || ""} disabled className={inputClass} />
            </div>
            <div className="flex gap-2 rounded-xl bg-electric/5 p-3 text-xs text-ink-500">
              <Info className="h-4 w-4 shrink-0 text-electric-light" />
              <p>
                To change the admin password, run <code className="text-ink-300">npm run hash-password -- "newPassword"</code>{" "}
                in the <code className="text-ink-300">backend</code> folder and update{" "}
                <code className="text-ink-300">ADMIN_PASSWORD_HASH</code> in <code className="text-ink-300">backend/.env</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="font-display text-sm font-semibold text-ink-100">Preferences</h3>
          <p className="mt-1 text-xs text-ink-700">Stored in this browser only — used as defaults when creating new quizzes.</p>
          <div className="mt-4 space-y-3">
            {[
              { key: "emailNotifs", label: "Email me on new submissions (not yet wired to an email provider)" },
              { key: "publicResultsDefault", label: "New quizzes default to public leaderboard" },
              { key: "strictProctoringDefault", label: "New quizzes default to a low tab-switch limit" },
            ].map((opt) => (
              <div key={opt.key} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
                <span className="text-sm text-ink-300">{opt.label}</span>
                <button
                  onClick={() => setToggles((t) => ({ ...t, [opt.key]: !t[opt.key] }))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                    toggles[opt.key] ? "bg-electric shadow-glow" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 ${
                      toggles[opt.key] ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Button className="mt-4" icon={Save} onClick={saveLocalPrefs}>
        Save preferences
      </Button>
    </AdminLayout>
  );
}
