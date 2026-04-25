import { TopNav } from "@/components/layout/top-nav";
import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* 顶部导航栏 */}
      <TopNav />
      
      {/* 主体区域：左侧边栏 + 右侧内容 */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
