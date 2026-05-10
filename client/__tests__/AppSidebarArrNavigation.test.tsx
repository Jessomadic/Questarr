/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppSidebar from "../src/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DownloadStatus, Game } from "@shared/schema";

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    logout: vi.fn(),
    user: { username: "tester" },
  }),
}));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const renderSidebar = (activeItem = "/") => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          if (queryKey[0] === "/api/downloads") return { downloads: [] };
          return [];
        },
        staleTime: Infinity,
      },
    },
  });
  queryClient.setQueryData<Game[]>(
    ["/api/games"],
    [
      { id: "1", title: "Owned", status: "owned" } as Game,
      { id: "2", title: "Wanted", status: "wanted" } as Game,
    ]
  );
  queryClient.setQueryData<{ downloads: DownloadStatus[] }>(["/api/downloads"], {
    downloads: [
      { id: "dl-1", name: "Active", status: "downloading", progress: 50 } as DownloadStatus,
      { id: "dl-2", name: "Failed", status: "error", progress: 0 } as DownloadStatus,
    ],
  });

  const navigate = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar activeItem={activeItem} onNavigate={navigate} />
        </SidebarProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );

  return { navigate };
};

describe("AppSidebar Arr navigation", () => {
  it("renders Arr-style groups and badges", () => {
    renderSidebar("/activity/queue");

    expect(screen.getAllByText("Library").length).toBeGreaterThan(0);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByTestId("nav-wanted")).toHaveTextContent("1");
    expect(screen.getByTestId("nav-queue")).toHaveTextContent("1");
    expect(screen.getByTestId("nav-history")).toHaveTextContent("1");
  });

  it("navigates to new stable Arr routes", () => {
    const { navigate } = renderSidebar();

    fireEvent.click(screen.getByTestId("nav-profiles"));
    expect(navigate).toHaveBeenCalledWith("/settings/profiles");

    fireEvent.click(screen.getByTestId("nav-status"));
    expect(navigate).toHaveBeenCalledWith("/system/status");
  });
});
