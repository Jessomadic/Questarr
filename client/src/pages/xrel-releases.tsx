import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Copy,
  ExternalLink,
  FilterX,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type XrelSource = "scene" | "p2p" | "all";

interface XrelRelease {
  id: string;
  dirname: string;
  link_href: string;
  time: number;
  group_name: string;
  sizeMb?: number;
  sizeUnit?: string;
  ext_info?: { title: string; link_href: string; rating?: number; num_ratings?: number };
  source: "scene" | "p2p";
  category?: string;
  categoryId?: string;
  comments?: number;
  numRatings?: number;
  flags?: Record<string, boolean>;
  videoType?: string;
  audioType?: string;
  mainLang?: string;
  isWanted?: boolean;
  libraryStatus?: string;
  gameId?: string;
  matchCandidate?: {
    title: string;
    igdbId: number;
  };
}

interface XrelLatestResponse {
  list: XrelRelease[];
  pagination: { current_page: number; per_page: number; total_pages: number };
  total_count: number;
}

interface XrelSearchResponse {
  results: XrelRelease[];
}

interface XrelCategoriesResponse {
  scene: Array<{ name: string; parent_cat?: string }>;
  p2p: Array<{ id: string; meta_cat?: string; sub_cat?: string }>;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

function formatDate(ts: number): string {
  if (!ts) return "Unknown";
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatSize(mb?: number, unit?: string): string {
  if (mb == null) return "Unknown";
  if (unit === "GB") return `${mb.toFixed(1)} GB`;
  if (unit === "MB") return `${Math.round(mb)} MB`;
  if (mb >= 1024 && !unit) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} ${unit || "MB"}`;
}

function safeUrl(url: string | undefined): string {
  if (!url) return "#";
  try {
    return new URL(url, "https://www.xrel.to").toString();
  } catch {
    return "#";
  }
}

function p2pCategoryLabel(category: { id: string; meta_cat?: string; sub_cat?: string }): string {
  return [category.meta_cat, category.sub_cat].filter(Boolean).join(" > ") || category.id;
}

function getStatusVariant(status: string | undefined): "default" | "secondary" | "outline" {
  if (status === "wanted") return "default";
  if (status) return "secondary";
  return "outline";
}

export default function XrelReleasesPage() {
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<XrelSource>("scene");
  const [archive, setArchive] = useState("");
  const [sceneCategory, setSceneCategory] = useState("all");
  const [p2pCategoryId, setP2pCategoryId] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const categoriesQuery = useQuery<XrelCategoriesResponse>({
    queryKey: ["/api/xrel/categories"],
    queryFn: async () => {
      const res = await fetch("/api/xrel/categories", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch xREL categories");
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const isSearchMode = submittedSearch.trim().length > 0;

  const releasesQuery = useQuery<XrelLatestResponse | XrelSearchResponse>({
    queryKey: [
      "/api/xrel/releases",
      page,
      source,
      archive,
      sceneCategory,
      p2pCategoryId,
      submittedSearch,
    ],
    queryFn: async () => {
      if (submittedSearch.trim()) {
        const params = new URLSearchParams({
          q: submittedSearch.trim(),
          scene: source !== "p2p" ? "1" : "0",
          p2p: source !== "scene" ? "1" : "0",
          limit: "25",
        });
        const res = await fetch(`/api/xrel/search?${params}`, { headers: authHeaders() });
        if (!res.ok) throw new Error("Failed to search xREL releases");
        return res.json();
      }

      const params = new URLSearchParams({
        page: String(page),
        perPage: "50",
        source,
      });
      if (archive) params.set("archive", archive);
      if (sceneCategory !== "all") params.set("sceneCategory", sceneCategory);
      if (p2pCategoryId !== "all") params.set("p2pCategoryId", p2pCategoryId);

      const res = await fetch(`/api/xrel/latest?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch xREL latest releases");
      return res.json();
    },
  });

  const addGameMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await fetch("/api/games/match-and-add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add game");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Game added",
        description: `Added "${data.title}" to your wanted list`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/xrel/releases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to add game",
        description: error.message,
      });
    },
  });

  const list = useMemo(() => {
    const data = releasesQuery.data;
    if (!data) return [];
    return "results" in data ? data.results : data.list;
  }, [releasesQuery.data]);

  const pagination =
    releasesQuery.data && "pagination" in releasesQuery.data ? releasesQuery.data.pagination : null;
  const totalPages = pagination?.total_pages ?? 1;
  const sceneCategories = categoriesQuery.data?.scene ?? [];
  const p2pCategories = categoriesQuery.data?.p2p ?? [];

  function resetFilters() {
    setPage(1);
    setSource("scene");
    setArchive("");
    setSceneCategory("all");
    setP2pCategoryId("all");
    setSearchInput("");
    setSubmittedSearch("");
  }

  function submitSearch() {
    setPage(1);
    setSubmittedSearch(searchInput.trim());
  }

  async function copyReleaseName(dirname: string) {
    await navigator.clipboard.writeText(dirname);
    toast({
      title: "Release name copied",
      description: "Use the exact xREL dirname when searching Usenet or torrent indexers.",
    });
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">xREL.to Releases</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Browse xREL.to PreDB entries for exact release names, NFO context, release dates, and
            technical metadata. xREL does not provide downloads, NZBs, torrents, or DDL links.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <Button variant="outline" size="icon" onClick={resetFilters} aria-label="Reset filters">
            <FilterX className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => releasesQuery.refetch()}
            disabled={releasesQuery.isFetching}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${releasesQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Release browser</CardTitle>
              <CardDescription>
                Use these verified dirnames as reference terms for your configured indexers or
                public Usenet search engines.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">PreDB only</Badge>
              <Badge variant="outline" className="uppercase">
                {isSearchMode ? "search" : source}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[160px_180px_180px_180px_1fr_auto]">
            <Select
              value={source}
              onValueChange={(value: XrelSource) => {
                setSource(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scene">Scene</SelectItem>
                <SelectItem value="p2p">P2P</SelectItem>
                <SelectItem value="all">Scene + P2P</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Archive YYYY-MM"
                value={archive}
                onChange={(event) => {
                  setArchive(event.target.value);
                  setPage(1);
                }}
                disabled={source === "p2p" || isSearchMode}
              />
            </div>

            <Select
              value={sceneCategory}
              onValueChange={(value) => {
                setSceneCategory(value);
                setPage(1);
              }}
              disabled={source === "p2p" || isSearchMode || categoriesQuery.isLoading}
            >
              <SelectTrigger aria-label="Scene category">
                <SelectValue placeholder="Scene category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scene categories</SelectItem>
                {sceneCategories.map((category) => (
                  <SelectItem key={category.name} value={category.name}>
                    {category.parent_cat
                      ? `${category.parent_cat} > ${category.name}`
                      : category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={p2pCategoryId}
              onValueChange={(value) => {
                setP2pCategoryId(value);
                setPage(1);
              }}
              disabled={source === "scene" || isSearchMode || categoriesQuery.isLoading}
            >
              <SelectTrigger aria-label="P2P category">
                <SelectValue placeholder="P2P category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All P2P categories</SelectItem>
                {p2pCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {p2pCategoryLabel(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Search release names"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
            />
            <Button onClick={submitSearch} className="gap-2">
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>

          {isSearchMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Search:</span>
              <span className="font-medium">{submittedSearch}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  setSubmittedSearch("");
                  setSearchInput("");
                }}
              >
                Clear
              </Button>
            </div>
          )}

          {releasesQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mr-2" />
              Loading...
            </div>
          ) : releasesQuery.isError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {releasesQuery.error instanceof Error
                ? releasesQuery.error.message
                : "Questarr could not load xREL releases."}
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No xREL releases matched the current view.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={resetFilters}>
                <FilterX className="h-4 w-4" />
                Reset filters
              </Button>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[42%]">Release</TableHead>
                    <TableHead>Game</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((rel) => (
                    <TableRow key={`${rel.source}-${rel.id}`}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium break-all" title={rel.dirname}>
                            {rel.dirname}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {rel.flags?.nuke_rls && (
                              <Badge variant="destructive" className="text-[10px]">
                                Nuked
                              </Badge>
                            )}
                            {rel.flags?.fix_rls && (
                              <Badge variant="secondary" className="text-[10px]">
                                Fix
                              </Badge>
                            )}
                            {rel.flags?.english && (
                              <Badge variant="outline" className="text-[10px]">
                                English
                              </Badge>
                            )}
                            {rel.category && (
                              <Badge variant="outline" className="text-[10px]">
                                {rel.category}
                              </Badge>
                            )}
                            {rel.videoType && (
                              <Badge variant="outline" className="text-[10px]">
                                {rel.videoType}
                              </Badge>
                            )}
                            {rel.audioType && (
                              <Badge variant="outline" className="text-[10px]">
                                {rel.audioType}
                              </Badge>
                            )}
                            {rel.mainLang && (
                              <Badge variant="outline" className="text-[10px]">
                                {rel.mainLang}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {rel.ext_info?.title ? (
                            <a
                              href={safeUrl(rel.ext_info.link_href)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline"
                            >
                              {rel.ext_info.title}
                            </a>
                          ) : (
                            <span className="text-muted-foreground">Unknown</span>
                          )}
                          <div className="flex flex-wrap gap-1">
                            {rel.libraryStatus && (
                              <Badge
                                variant={getStatusVariant(rel.libraryStatus)}
                                className="text-[10px]"
                              >
                                {rel.libraryStatus}
                              </Badge>
                            )}
                            {rel.ext_info?.rating != null && (
                              <Badge variant="outline" className="text-[10px]">
                                {rel.ext_info.rating}/10
                              </Badge>
                            )}
                            {rel.comments != null && (
                              <Badge variant="outline" className="text-[10px]">
                                {rel.comments} comments
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rel.source === "scene" ? "default" : "secondary"}>
                          {rel.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate">
                        {rel.group_name || "Unknown"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatSize(rel.sizeMb, rel.sizeUnit)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(rel.time)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {rel.matchCandidate && !rel.libraryStatus && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 gap-1"
                              onClick={() => addGameMutation.mutate(rel.matchCandidate!.title)}
                              disabled={
                                addGameMutation.isPending &&
                                addGameMutation.variables === rel.matchCandidate.title
                              }
                              title={`Add "${rel.matchCandidate.title}" to wanted list`}
                            >
                              {addGameMutation.isPending &&
                              addGameMutation.variables === rel.matchCandidate.title ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Add
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => copyReleaseName(rel.dirname)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                          <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                            <a href={`/search?q=${encodeURIComponent(rel.dirname)}`}>
                              <Search className="h-3.5 w-3.5" />
                              Find
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild className="h-8 gap-1">
                            <a
                              href={safeUrl(rel.link_href)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              xREL
                            </a>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {!isSearchMode && (page > 1 || totalPages > 1) && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {pagination?.current_page ?? page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
