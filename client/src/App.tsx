import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import Header from "@/components/Header";
import { useBackgroundNotifications } from "@/hooks/use-background-notifications";
import { AuthProvider } from "@/lib/auth";
import { Suspense, lazy } from "react";
import LoadingFallback from "@/components/LoadingFallback";
import { ThemeProvider } from "next-themes";

// ⚡ Bolt: Code splitting with React.lazy
// This reduces the initial bundle size by loading pages only when needed.
const Dashboard = lazy(() => import("@/components/Dashboard"));
const DiscoverPage = lazy(() => import("@/pages/discover"));
const SearchPage = lazy(() => import("@/pages/search"));
const DownloadsPage = lazy(() => import("@/pages/downloads"));
const IndexersPage = lazy(() => import("@/pages/indexers"));
const DownloadersPage = lazy(() => import("@/pages/downloaders"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const ArrPlaceholderPage = lazy(() => import("@/pages/arr-placeholder"));
const NotFound = lazy(() => import("@/pages/not-found"));
const LibraryPage = lazy(() => import("@/pages/library"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const WishlistPage = lazy(() => import("@/pages/wishlist"));
const XrelReleasesPage = lazy(() => import("@/pages/xrel-releases"));
const RssPage = lazy(() => import("@/pages/rss"));
const LoginPage = lazy(() => import("@/pages/auth/login"));
const SetupPage = lazy(() => import("@/pages/auth/setup"));
const StatsPage = lazy(() => import("@/pages/stats"));

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/setup" component={SetupPage} />
        <Route path="/" component={Dashboard} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/search" component={SearchPage} />
        <Route path="/activity/queue" component={DownloadsPage} />
        <Route path="/activity/history" component={ArrPlaceholderPage} />
        <Route path="/activity/blocklist" component={ArrPlaceholderPage} />
        <Route path="/activity" component={DownloadsPage} />
        <Route path="/downloads" component={DownloadsPage} />
        <Route path="/indexers" component={IndexersPage} />
        <Route path="/downloaders" component={DownloadersPage} />
        <Route path="/settings/profiles" component={ArrPlaceholderPage} />
        <Route path="/settings/media-management" component={ArrPlaceholderPage} />
        <Route path="/settings/indexers" component={IndexersPage} />
        <Route path="/settings/download-clients" component={DownloadersPage} />
        <Route path="/settings/connect" component={ArrPlaceholderPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/system/status" component={ArrPlaceholderPage} />
        <Route path="/system/tasks" component={ArrPlaceholderPage} />
        <Route path="/system/logs" component={ArrPlaceholderPage} />
        <Route path="/library" component={LibraryPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/wishlist" component={WishlistPage} />
        <Route path="/wanted" component={WishlistPage} />
        <Route path="/xrel" component={XrelReleasesPage} />
        <Route path="/rss" component={RssPage} />
        <Route path="/stats" component={StatsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  // Enable background notifications for downloads
  useBackgroundNotifications();

  return <Router />;
}

function App() {
  const [location, navigate] = useLocation();

  // Custom sidebar width for the application
  const style = {
    "--sidebar-width": "16rem", // 256px for navigation
    "--sidebar-width-icon": "4rem", // default icon width
  };

  const getPageTitle = (path: string) => {
    if (path.startsWith("/activity/queue")) return "Queue";
    if (path.startsWith("/activity/history")) return "History";
    if (path.startsWith("/activity/blocklist")) return "Blocklist";
    if (path.startsWith("/activity")) return "Activity";
    if (path.startsWith("/settings/profiles")) return "Release Profiles";
    if (path.startsWith("/settings/media-management")) return "Media Management";
    if (path.startsWith("/settings/indexers")) return "Indexers";
    if (path.startsWith("/settings/download-clients")) return "Download Clients";
    if (path.startsWith("/settings/connect")) return "Connect";
    if (path.startsWith("/system/status")) return "System Status";
    if (path.startsWith("/system/tasks")) return "Tasks";
    if (path.startsWith("/system/logs")) return "Logs";

    switch (path) {
      case "/":
        return "Dashboard";
      case "/discover":
        return "Discover";
      case "/search":
        return "Search";
      case "/downloads":
        return "Downloads";
      case "/wanted":
        return "Wanted";
      case "/indexers":
        return "Indexers";
      case "/downloaders":
        return "Downloaders";
      case "/settings":
        return "Settings";
      case "/library":
        return "Library";
      case "/calendar":
        return "Calendar";
      case "/wishlist":
        return "Wishlist";
      case "/xrel":
        return "xREL.to releases";
      case "/rss":
        return "RSS Feeds";
      case "/stats":
        return "Statistics";
      default:
        return "Questarr";
    }
  };

  // If on login or setup page, render simplified layout without sidebar/header
  if (location === "/login" || location === "/setup") {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <AuthProvider>
            <Router />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        <AuthProvider>
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full overflow-hidden">
                <AppSidebar activeItem={location} onNavigate={navigate} />
                <div className="flex flex-col flex-1 min-w-0">
                  <Header title={getPageTitle(location)} />
                  <main className="flex-1 overflow-hidden">
                    <AppContent />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
