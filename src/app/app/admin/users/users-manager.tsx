"use client";

import { useCallback, useEffect, useState } from "react";

const ROLES = ["owner", "admin", "manager", "cashier", "accountant", "viewer"] as const;

interface MemberRow {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
}

export function UsersManager() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("cashier");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/admin/users");
    if (res.ok) {
      const json = await res.json();
      setMembers(json.data.members);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/v1/admin/users");
      if (!cancelled && res.ok) {
        const json = await res.json();
        setMembers(json.data.members);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/v1/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setEmail("");
      setMsg("Member added");
      void load();
    } else {
      setMsg(json?.error?.messageEn ?? `Error ${res.status}`);
    }
  }

  async function changeRole(memberId: string, newRole: string) {
    setMsg(null);
    const res = await fetch(`/api/v1/admin/users/${memberId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setMsg(res.ok ? "Role updated" : (await res.json().catch(() => ({})))?.error?.messageEn ?? "Error");
    void load();
  }

  async function removeMember(memberId: string) {
    setMsg(null);
    const res = await fetch(`/api/v1/admin/users/${memberId}`, { method: "DELETE" });
    setMsg(res.ok ? "Removed" : (await res.json().catch(() => ({})))?.error?.messageEn ?? "Error");
    void load();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addMember} className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-800">Add existing platform user</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm text-neutral-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1 block w-64 rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-neutral-700">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block rounded-md border border-neutral-300 px-3 py-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
            Add member
          </button>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          The user must already have a platform account (email/password). Email invitations arrive
          with M12.
        </p>
      </form>

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-800">Members</h2>
        {loading ? (
          <p className="mt-3 text-sm text-neutral-400">Loading…</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
                <th className="py-2">User</th>
                <th className="py-2">Role</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5">
                    <span className="font-medium text-neutral-800">{m.user.name ?? "—"}</span>
                    <span className="ms-2 text-xs text-neutral-400">{m.user.email}</span>
                  </td>
                  <td className="py-2.5">
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.id, e.target.value)}
                      className="rounded-md border border-neutral-200 px-2 py-1"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-500"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {msg && <p className="mt-3 text-sm text-neutral-500">{msg}</p>}
      </div>
    </div>
  );
}
