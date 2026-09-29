import { redirect } from "next/navigation";
import AdminsManager from "@/components/admin/AdminsManager";
import { getAdminStatus } from "@/lib/auth";

export const metadata = { title: "Admins" };
export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  const { user } = await getAdminStatus();
  if (!user) redirect("/login?next=/admin/admins");

  return (
    <div>
      <h1 className="text-2xl font-bold">Admins</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Manage who can access this site. Only active admins can sign in and use
        the generator or this panel.
      </p>
      <div className="mt-6">
        <AdminsManager currentEmail={user.email} />
      </div>
    </div>
  );
}
