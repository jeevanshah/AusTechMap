/* Hallmark · macrostructure: map-diagram · theme: National Registry · system: DESIGN.md */
"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Anchor,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bookmark,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Crosshair,
  ExternalLink,
  Layers,
  Loader2,
  MapPin,
  Minus,
  Network,
  Plus,
  Radio,
  Rocket,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";

import type {
  AlertFrequency,
  Category,
  CompanySearchResult,
  MapCompanyPoint,
  RegionalHub,
  SavedSearchFilter,
  WorkStyle,
} from "@austechmap/contracts";

import { saveSearchAction } from "../actions/retentionActions";

import {
  MapCanvas,
  type Bbox,
  type CameraTarget,
} from "../../components/map/MapCanvas";
import {
  CompanyBrandMark,
  extractDomainFromUrl,
} from "../../components/ui/CompanyBrandMark";
import { getCategoryIconPath } from "../../lib/category-icons";
import { trackEvent } from "../../lib/analytics";

export { getCategoryIconPath };

export interface HomeMapShellProps {
  initialPoints: MapCompanyPoint[];
  initialBbox: Bbox;
  initialHubs?: RegionalHub[];
  currentUser?: { email: string; role: string } | null;
}

const SEARCH_DEBOUNCE_MS = 300;
const MOVE_DEBOUNCE_MS = 300;

interface ListEntry {
  slug: string;
  name: string;
  domain?: string | null;
  careersUrl: string | null;
  city: string | null;
  primaryCategory: string | null;
  hasSponsorshipEvidence: boolean;
  isRegional: boolean;
  activeJobsCount?: number;
  topRoleFamilies?: string[];
  workStyles?: WorkStyle[];
}

interface HubMeta {
  state: string;
  center: [number, number];
  zoom: number;
  tag: string;
  icon: typeof Building2;
  sa4Code?: string;
}

export interface DisplayedHub {
  city: string;
  state: string;
  count: number;
  center: [number, number];
  zoom: number;
  tag: string;
  icon: typeof Building2;
  sa4Code?: string;
}

const HUB_METADATA: Record<string, HubMeta> = {
  Perth: {
    state: "WA",
    center: [115.8605, -31.9505],
    zoom: 11,
    tag: "Resources, Mining Tech & Autonomous Systems",
    icon: Cpu,
    sa4Code: "503",
  },
  Adelaide: {
    state: "SA",
    center: [138.6007, -34.9285],
    zoom: 11,
    tag: "Lot Fourteen Space, Defence & Machine Learning",
    icon: Rocket,
    sa4Code: "401",
  },
  Canberra: {
    state: "ACT",
    center: [149.13, -35.2809],
    zoom: 11,
    tag: "National Security, Cyber & GovTech",
    icon: Shield,
    sa4Code: "801",
  },
  Wollongong: {
    state: "NSW",
    center: [150.8931, -34.4278],
    zoom: 12,
    tag: "Illawarra Innovation Campus & CleanTech",
    icon: Network,
    sa4Code: "107",
  },
  Newcastle: {
    state: "NSW",
    center: [151.7817, -32.9283],
    zoom: 12,
    tag: "Hunter Energy Tech & Industrial Software",
    icon: Zap,
    sa4Code: "111",
  },
  Darwin: {
    state: "NT",
    center: [130.8456, -12.4634],
    zoom: 12,
    tag: "Northern Territory Defence & Marine Systems",
    icon: Radio,
    sa4Code: "701",
  },
  Hobart: {
    state: "TAS",
    center: [147.3272, -42.8821],
    zoom: 12,
    tag: "Antarctic, Marine Science & AgriTech",
    icon: Anchor,
    sa4Code: "601",
  },
  Geelong: {
    state: "VIC",
    center: [144.3607, -38.1499],
    zoom: 12,
    tag: "Advanced Manufacturing & Regional Tech",
    icon: Cpu,
    sa4Code: "203",
  },
  "Gold Coast": {
    state: "QLD",
    center: [153.4, -28.0167],
    zoom: 12,
    tag: "Aerospace & Coastal Tech Startups",
    icon: Rocket,
    sa4Code: "309",
  },
  "Sunshine Coast": {
    state: "QLD",
    center: [153.0667, -26.65],
    zoom: 12,
    tag: "Subsea Cable & Digital Innovation Hub",
    icon: Network,
    sa4Code: "316",
  },
  Bendigo: {
    state: "VIC",
    center: [144.2802, -36.757],
    zoom: 12,
    tag: "Regional Finance & Digital Services",
    icon: Building2,
    sa4Code: "202",
  },
  Launceston: {
    state: "TAS",
    center: [147.1358, -41.4332],
    zoom: 12,
    tag: "Tamar Valley Digital & AgriTech Innovation",
    icon: Network,
    sa4Code: "602",
  },
  Orange: {
    state: "NSW",
    center: [149.0998, -33.2836],
    zoom: 12,
    tag: "Central West Precision AgTech & Mining Software",
    icon: Cpu,
    sa4Code: "103",
  },
  Toowoomba: {
    state: "QLD",
    center: [151.9507, -27.5598],
    zoom: 12,
    tag: "Darling Downs AgTech, Energy & Logistics",
    icon: Cpu,
    sa4Code: "317",
  },
  Ballarat: {
    state: "VIC",
    center: [143.8503, -37.5622],
    zoom: 12,
    tag: "Ballarat Tech Park, HealthTech & Cybersecurity",
    icon: Shield,
    sa4Code: "201",
  },
  Cairns: {
    state: "QLD",
    center: [145.7781, -16.9186],
    zoom: 12,
    tag: "Tropical Marine Science, Aviation & CleanTech",
    icon: Anchor,
    sa4Code: "306",
  },
  Townsville: {
    state: "QLD",
    center: [146.8169, -19.2590],
    zoom: 12,
    tag: "North Queensland Clean Energy, Defence & Marine",
    icon: Zap,
    sa4Code: "318",
  },
  Mackay: {
    state: "QLD",
    center: [149.1868, -21.1411],
    zoom: 12,
    tag: "Biofutures, Mining Systems & Heavy Engineering",
    icon: Cpu,
    sa4Code: "312",
  },
  "Alice Springs": {
    state: "NT",
    center: [133.8807, -23.698],
    zoom: 12,
    tag: "Centre for Appropriate Tech, Space & Solar",
    icon: Radio,
    sa4Code: "702",
  },
  Morwell: {
    state: "VIC",
    center: [146.4, -38.2333],
    zoom: 12,
    tag: "Latrobe Valley Energy Transition & Industrial Automation",
    icon: Zap,
    sa4Code: "205",
  },
  Moe: {
    state: "VIC",
    center: [146.2667, -38.1833],
    zoom: 12,
    tag: "Gippsland Renewable Energy & Engineering Cluster",
    icon: Zap,
    sa4Code: "205",
  },
  "Byron Bay": {
    state: "NSW",
    center: [153.6167, -28.6474],
    zoom: 12,
    tag: "Northern Rivers Creative Tech & Sustainability",
    icon: Rocket,
    sa4Code: "112",
  },
  Emerald: {
    state: "QLD",
    center: [148.15, -23.5333],
    zoom: 12,
    tag: "Central Highlands Agriculture & Resources Tech",
    icon: Cpu,
    sa4Code: "308",
  },
  Griffith: {
    state: "NSW",
    center: [146.04, -34.2889],
    zoom: 12,
    tag: "Riverina Agri-food Innovation & Water Tech",
    icon: Anchor,
    sa4Code: "113",
  },
  "Central Coast": {
    state: "NSW",
    center: [151.3417, -33.4267],
    zoom: 12,
    tag: "Food Innovation & Coastal Tech Corridor",
    icon: Network,
    sa4Code: "102",
  },
  "Coffs Harbour": {
    state: "NSW",
    center: [153.1141, -30.2963],
    zoom: 12,
    tag: "Mid North Coast Digital & Creative Enterprise",
    icon: Network,
    sa4Code: "104",
  },
  Bunbury: {
    state: "WA",
    center: [115.6333, -33.3256],
    zoom: 12,
    tag: "South West Clean Energy & Port Logistics",
    icon: Anchor,
    sa4Code: "501",
  },
  Shepparton: {
    state: "VIC",
    center: [145.3992, -36.3811],
    zoom: 12,
    tag: "Goulburn Valley FoodTech & Automated Logistics",
    icon: Cpu,
    sa4Code: "216",
  },
  Warrnambool: {
    state: "VIC",
    center: [142.4833, -38.3833],
    zoom: 12,
    tag: "Great Ocean Road Renewable Energy & Dairy Tech",
    icon: Zap,
    sa4Code: "217",
  },
  Sydney: {
    state: "NSW",
    center: [151.2093, -33.8688],
    zoom: 11,
    tag: "Flagship Tech Central & Barangaroo",
    icon: Building2,
    sa4Code: "117",
  },
  Melbourne: {
    state: "VIC",
    center: [144.9631, -37.8136],
    zoom: 11,
    tag: "Docklands & Cremorne Digital Cluster",
    icon: Network,
    sa4Code: "206",
  },
  Brisbane: {
    state: "QLD",
    center: [153.0251, -27.4698],
    zoom: 11,
    tag: "Fortitude Valley & Enterprise Hub",
    icon: Building2,
    sa4Code: "305",
  },
};

const CITY_STATE_MAP: Record<string, string> = {
  Sydney: "NSW",
  Melbourne: "VIC",
  Brisbane: "QLD",
  Perth: "WA",
  Adelaide: "SA",
  Canberra: "ACT",
  Hobart: "TAS",
  Darwin: "NT",
  Newcastle: "NSW",
  Wollongong: "NSW",
  Geelong: "VIC",
  "Gold Coast": "QLD",
  "Sunshine Coast": "QLD",
  Bendigo: "VIC",
  Ballarat: "VIC",
  Cairns: "QLD",
  Townsville: "QLD",
  Toowoomba: "QLD",
  Orange: "NSW",
  "Wagga Wagga": "NSW",
  Albury: "NSW",
  Armidale: "NSW",
  Dubbo: "NSW",
  Bathurst: "NSW",
  "Coffs Harbour": "NSW",
  "Port Macquarie": "NSW",
  "Byron Bay": "NSW",
  "Central Coast": "NSW",
  Gosford: "NSW",
  Mildura: "VIC",
  Shepparton: "VIC",
  Wangaratta: "VIC",
  Warrnambool: "VIC",
  Traralgon: "VIC",
  Morwell: "VIC",
  Moe: "VIC",
  Bairnsdale: "VIC",
  Castlemaine: "VIC",
  Echuca: "VIC",
  Seymour: "VIC",
  Lara: "VIC",
  Lilydale: "VIC",
  Frankston: "VIC",
  Dandenong: "VIC",
  Mornington: "VIC",
  Mackay: "QLD",
  Rockhampton: "QLD",
  Bundaberg: "QLD",
  "Hervey Bay": "QLD",
  Gladstone: "QLD",
  Emerald: "QLD",
  "Mount Isa": "QLD",
  Noosa: "QLD",
  Ipswich: "QLD",
  Logan: "QLD",
  Caboolture: "QLD",
  Cleveland: "QLD",
  Atherton: "QLD",
  Innisfail: "QLD",
  Gympie: "QLD",
  Maryborough: "QLD",
  Roma: "QLD",
  Chinchilla: "QLD",
  Stanthorpe: "QLD",
  Weipa: "QLD",
  Albany: "WA",
  Bunbury: "WA",
  Busselton: "WA",
  Geraldton: "WA",
  Kalgoorlie: "WA",
  Karratha: "WA",
  "Port Hedland": "WA",
  Broome: "WA",
  Exmouth: "WA",
  Newman: "WA",
  Northam: "WA",
  Henderson: "WA",
  Kwinana: "WA",
  Fremantle: "WA",
  Joondalup: "WA",
  Midland: "WA",
  Mandurah: "WA",
  "Mount Gambier": "SA",
  Whyalla: "SA",
  "Port Augusta": "SA",
  "Port Lincoln": "SA",
  "Victor Harbor": "SA",
  Renmark: "SA",
  Clare: "SA",
  Tanunda: "SA",
  Ceduna: "SA",
  "Roxby Downs": "SA",
  Launceston: "TAS",
  Devonport: "TAS",
  Burnie: "TAS",
  "George Town": "TAS",
  "Alice Springs": "NT",
  Nhulunbuy: "NT",
};

export function formatLocation(city: string | null | undefined): string {
  if (!city) return "Australia";
  const trimmed = city.trim();
  const state = CITY_STATE_MAP[trimmed] ?? HUB_METADATA[trimmed]?.state;
  if (state) {
    return `${trimmed}, ${state}`;
  }
  if (/\b(NSW|VIC|QLD|WA|SA|ACT|TAS|NT)\b/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}, Australia`;
}



function CategoryBadge({
  category,
  size = "sm",
}: {
  category: string | null | undefined;
  size?: "sm" | "md";
}) {
  if (!category) return null;
  const iconPath = getCategoryIconPath(category);
  const sizeClasses = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 shadow-2xs">
      {iconPath && (
        <span
          className={`relative inline-block ${sizeClasses} shrink-0 overflow-hidden rounded-full`}
        >
          <Image
            src={iconPath}
            alt={`${category} icon`}
            width={16}
            height={16}
            className="h-full w-full object-cover"
          />
        </span>
      )}
      <span className="truncate">{category}</span>
    </span>
  );
}

function pointsToListEntries(points: MapCompanyPoint[]): ListEntry[] {
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  for (const point of points) {
    if (seen.has(point.slug)) continue;
    seen.add(point.slug);
    entries.push({
      slug: point.slug,
      name: point.name,
      domain: extractDomainFromUrl(point.careersUrl, point.slug),
      careersUrl: point.careersUrl,
      city: point.city,
      primaryCategory: point.primaryCategory,
      hasSponsorshipEvidence: point.hasSponsorshipEvidence,
      isRegional: point.isRegional,
      activeJobsCount: point.activeJobsCount,
      topRoleFamilies: point.topRoleFamilies,
      workStyles: point.workStyles,
    });
  }
  return entries;
}

function searchResultsToListEntries(
  results: CompanySearchResult[],
): ListEntry[] {
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  for (const result of results) {
    if (seen.has(result.slug)) continue;
    seen.add(result.slug);
    entries.push({
      slug: result.slug,
      name: result.name,
      domain: result.domain,
      careersUrl: null,
      city: result.city,
      primaryCategory: result.primaryCategory,
      hasSponsorshipEvidence: result.hasSponsorshipEvidence,
      isRegional: result.isRegional,
      activeJobsCount: result.activeJobsCount,
      topRoleFamilies: result.topRoleFamilies,
      workStyles: result.workStyles,
    });
  }
  return entries;
}

export function HomeMapShell({
  initialPoints,
  initialBbox,
  initialHubs,
  currentUser,
}: HomeMapShellProps) {
  const [points, setPoints] = useState(initialPoints);
  const [hubs, setHubs] = useState<RegionalHub[]>(initialHubs ?? []);

  // Phase 7: Save Search Modal State
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveAlertFrequency, setSaveAlertFrequency] =
    useState<AlertFrequency>("never");
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(
    null,
  );
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialHubs && initialHubs.length > 0) return;
    fetch("/api/regions")
      .then((response) => response.json())
      .then((body: { hubs?: RegionalHub[] }) => {
        if (body.hubs && body.hubs.length > 0) {
          setHubs(body.hubs);
        }
      })
      .catch(() => {});
  }, [initialHubs]);

  const router = useRouter();
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });

  const displayedHubs = useMemo<DisplayedHub[]>(() => {
    let list: DisplayedHub[] = [];
    if (hubs.length > 0) {
      list = hubs
        .filter(
          (hub) =>
            hub.city !== "Sydney" &&
            hub.city !== "Melbourne" &&
            hub.city !== "Brisbane",
        )
        .map((hub) => {
          const meta = HUB_METADATA[hub.city] ?? {
            state: CITY_STATE_MAP[hub.city] ?? "AU",
            center: [133.7751, -25.2744] as [number, number],
            zoom: 11,
            tag: "Designated Regional Innovation Zone",
            icon: MapPin,
          };
          return {
            city: hub.city,
            state: meta.state || (CITY_STATE_MAP[hub.city] ?? "AU"),
            count: hub.count,
            center: meta.center,
            zoom: meta.zoom,
            tag: meta.tag,
            icon: meta.icon,
            sa4Code: meta.sa4Code,
          };
        });
    } else {
      list = Object.entries(HUB_METADATA)
        .filter(
          ([city]) =>
            city !== "Sydney" && city !== "Melbourne" && city !== "Brisbane",
        )
        .map(([city, meta]) => ({
          city,
          state: meta.state,
          count: 0,
          center: meta.center,
          zoom: meta.zoom,
          tag: meta.tag,
          icon: meta.icon,
          sa4Code: meta.sa4Code,
        }));
    }

    if (query.trim() !== "") {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (hub) =>
          hub.city.toLowerCase().includes(q) ||
          hub.state.toLowerCase().includes(q) ||
          hub.tag.toLowerCase().includes(q) ||
          (hub.sa4Code && hub.sa4Code.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [hubs, query]);
  const [searchResults, setSearchResults] = useState<
    CompanySearchResult[] | null
  >(null);
  const [searchError, setSearchError] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [showMapMobile, setShowMapMobile] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("category") ?? "";
  });
  const [sponsorshipOnly, setSponsorshipOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(
      new URLSearchParams(window.location.search).get("sponsorship"),
    );
  });
  const [regionalOnly, setRegionalOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(new URLSearchParams(window.location.search).get("regional"));
  });
  const [hiringOnly, setHiringOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(new URLSearchParams(window.location.search).get("hiring"));
  });
  const [selectedRoleFamily, setSelectedRoleFamily] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("role_family") ?? "";
  });
  const [selectedWorkStyle, setSelectedWorkStyle] = useState<
    "remote" | "hybrid" | "onsite" | ""
  >(() => {
    if (typeof window === "undefined") return "";
    const ws = new URLSearchParams(window.location.search).get("work_style");
    return ws === "remote" || ws === "hybrid" || ws === "onsite" ? ws : "";
  });
  const [activeHubCity, setActiveHubCity] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hub = new URLSearchParams(window.location.search).get("hub");
    return hub && HUB_METADATA[hub] ? hub : null;
  });
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(() => {
    if (typeof window === "undefined") return null;
    const hub = new URLSearchParams(window.location.search).get("hub");
    if (hub && HUB_METADATA[hub]) {
      const hubMeta = HUB_METADATA[hub];
      return {
        center: hubMeta.center,
        zoom: hubMeta.zoom,
        timestamp: Date.now(),
      };
    }
    return null;
  });
  const [currentBbox, setCurrentBbox] = useState<Bbox>(initialBbox);
  const [currentZoom, setCurrentZoom] = useState<number | null>(null);
  const [activeDirectoryTab, setActiveDirectoryTab] = useState<
    "companies" | "sponsors" | "regions"
  >(() => {
    if (typeof window === "undefined") return "companies";
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "regions" || tab === "sponsors" || tab === "companies") {
      return tab;
    }
    return "companies";
  });

  const handleTabChange = useCallback(
    (tab: "companies" | "sponsors" | "regions") => {
      setActiveDirectoryTab(tab);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (tab === "companies") {
          url.searchParams.delete("tab");
        } else {
          url.searchParams.set("tab", tab);
        }
        window.history.replaceState(null, "", url.toString());
      }
    },
    [],
  );
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const didMountMapFetchRef = useRef(false);
  const [searchAsMapMoves, setSearchAsMapMoves] = useState(true);
  const [hasMovedMapSinceSearch, setHasMovedMapSinceSearch] = useState(false);
  const [triggerBboxSearch, setTriggerBboxSearch] = useState(0);
  const isFocusingPointRef = useRef(false);

  const executeBboxSearch = useCallback(() => {
    setHasMovedMapSinceSearch(false);
    setTriggerBboxSearch((prev) => prev + 1);
  }, []);

  const computeDefaultSearchName = useCallback(() => {
    const parts: string[] = [];
    if (activeHubCity) parts.push(activeHubCity);
    if (selectedCategory) {
      const catObj = categories.find((c) => c.key === selectedCategory);
      parts.push(catObj ? catObj.label : selectedCategory);
    }
    if (sponsorshipOnly) parts.push("482 Sponsors");
    if (hiringOnly) parts.push("Actively Hiring");
    if (selectedRoleFamily) parts.push(selectedRoleFamily);
    if (selectedWorkStyle) {
      parts.push(
        selectedWorkStyle === "remote"
          ? "Remote"
          : selectedWorkStyle === "hybrid"
            ? "Hybrid"
            : "On-site",
      );
    }
    if (regionalOnly && !activeHubCity) parts.push("Regional Hubs");
    if (query) parts.push(`"${query}"`);
    return parts.length > 0 ? parts.join(" · ") : "Australia Tech Ecosystem";
  }, [
    activeHubCity,
    categories,
    hiringOnly,
    query,
    regionalOnly,
    selectedCategory,
    selectedRoleFamily,
    selectedWorkStyle,
    sponsorshipOnly,
  ]);

  const handleSaveSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      router.push("/sign-in?callbackUrl=/");
      return;
    }
    setIsSavingSearch(true);
    setSaveErrorMessage(null);
    setSaveSuccessMessage(null);

    const activeHubMeta = activeHubCity
      ? HUB_METADATA[activeHubCity]
      : undefined;
    const filters: SavedSearchFilter = {
      query: query || undefined,
      category: selectedCategory || undefined,
      roleFamily: selectedRoleFamily || undefined,
      hiring: hiringOnly || undefined,
      remote: selectedWorkStyle || undefined,
      sponsorship: sponsorshipOnly ? "current" : undefined,
      regional: regionalOnly || undefined,
      hubCity: activeHubCity || undefined,
      sa4Code: activeHubMeta?.sa4Code,
    };

    const res = await saveSearchAction(
      saveSearchName.trim() || computeDefaultSearchName(),
      filters,
      saveAlertFrequency,
    );
    setIsSavingSearch(false);
    if (res.success) {
      setSaveSuccessMessage("Saved! Manage in your Account.");
      setTimeout(() => {
        setShowSaveModal(false);
        setSaveSuccessMessage(null);
      }, 1500);
    } else {
      setSaveErrorMessage(res.error ?? "Failed to save search");
    }
  };

  const handleZoomIn = () => {
    const zoom = (currentZoom ?? 4) + 1;
    const centerLng =
      currentBbox.west + (currentBbox.east - currentBbox.west) / 2;
    const centerLat =
      currentBbox.south + (currentBbox.north - currentBbox.south) / 2;
    setCameraTarget({
      center: [centerLng, centerLat],
      zoom: Math.min(18, zoom),
      timestamp: Date.now(),
    });
  };

  const handleZoomOut = () => {
    const zoom = Math.max(3, (currentZoom ?? 4) - 1);
    const centerLng =
      currentBbox.west + (currentBbox.east - currentBbox.west) / 2;
    const centerLat =
      currentBbox.south + (currentBbox.north - currentBbox.south) / 2;
    setCameraTarget({
      center: [centerLng, centerLat],
      zoom,
      timestamp: Date.now(),
    });
  };

  const handleRecenter = () => {
    setCameraTarget({
      center: [133.7751, -25.2744],
      zoom: 4,
      timestamp: Date.now(),
    });
    setActiveHubCity(null);
    setCurrentBbox(initialBbox);
    setCurrentZoom(4);
    setTriggerBboxSearch((prev) => prev + 1);
  };

  // Global spotlight keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    fetch("/api/categories")
      .then((response) => response.json())
      .then((body: { categories?: Category[] }) =>
        setCategories(body.categories ?? []),
      )
      .catch(() => {
        /* leave the filter showing only "All categories" */
      });
  }, []);

  const categoryGroups = useMemo(() => {
    const groups = new Map<string, { groupLabel: string; items: Category[] }>();
    for (const category of categories) {
      const group = groups.get(category.groupKey);
      if (group) {
        group.items.push(category);
      } else {
        groups.set(category.groupKey, {
          groupLabel: category.groupLabel,
          items: [category],
        });
      }
    }
    return Array.from(groups.values());
  }, [categories]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    const trimmed = query.trim();
    if (trimmed === "") return;
    searchTimeoutRef.current = setTimeout(() => {
      trackEvent("search_submitted", { query: trimmed });
      const categoryParam = selectedCategory
        ? `&category=${encodeURIComponent(selectedCategory)}`
        : "";
      const sponsorshipParam = sponsorshipOnly ? "&sponsorship=true" : "";
      const regionalParam = regionalOnly ? "&regional=true" : "";
      const hiringParam = hiringOnly ? "&hiring=true" : "";
      const roleFamilyParam = selectedRoleFamily
        ? `&role_family=${encodeURIComponent(selectedRoleFamily)}`
        : "";
      const workStyleParam = selectedWorkStyle
        ? `&work_style=${encodeURIComponent(selectedWorkStyle)}`
        : "";
      fetch(
        `/api/search/companies?q=${encodeURIComponent(trimmed)}${categoryParam}${sponsorshipParam}${regionalParam}${hiringParam}${roleFamilyParam}${workStyleParam}`,
      )
        .then((response) => response.json())
        .then((body: { results?: CompanySearchResult[] }) => {
          setSearchResults(body.results ?? []);
          setSearchError(false);
        })
        .catch(() => {
          setSearchResults([]);
          setSearchError(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [
    query,
    selectedCategory,
    sponsorshipOnly,
    regionalOnly,
    hiringOnly,
    selectedRoleFamily,
    selectedWorkStyle,
  ]);

  const handleMoveEnd = useCallback(
    (bbox: Bbox, zoom: number) => {
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
      moveTimeoutRef.current = setTimeout(() => {
        // If this move was triggered by focusing an employer point, don't crush results
        if (isFocusingPointRef.current) {
          isFocusingPointRef.current = false;
          return;
        }

        let west = bbox.west;
        let east = bbox.east;
        let south = bbox.south;
        let north = bbox.north;

        // When zoomed out to continental / national scale (zoom <= 5) or spanning the globe,
        // use canonical Australia bounds so all nationwide companies are loaded without clipping
        if (zoom <= 5 || east - west >= 300) {
          west = 96;
          east = 168;
          south = -45;
          north = -9;
        } else {
          west = Math.max(-180, Math.min(180, west));
          east = Math.max(-180, Math.min(180, east));
          south = Math.max(-89.9, Math.min(89.9, south));
          north = Math.max(-89.9, Math.min(89.9, north));
          if (west >= east) {
            west = -180;
            east = 180;
          }
          if (south >= north) {
            south = -89.9;
            north = 89.9;
          }
        }

        setCurrentBbox({ west, south, east, north });
        setCurrentZoom(zoom);

        if (searchAsMapMoves) {
          setTriggerBboxSearch((prev) => prev + 1);
          setHasMovedMapSinceSearch(false);
        } else {
          setHasMovedMapSinceSearch(true);
        }
      }, MOVE_DEBOUNCE_MS);
    },
    [searchAsMapMoves],
  );

  useEffect(() => {
    if (!didMountMapFetchRef.current) {
      didMountMapFetchRef.current = true;
      return;
    }
    let west = currentBbox.west;
    let east = currentBbox.east;
    let south = currentBbox.south;
    let north = currentBbox.north;

    if ((currentZoom !== null && currentZoom <= 5) || east - west >= 300) {
      west = 96;
      east = 168;
      south = -45;
      north = -9;
    } else {
      west = Math.max(-180, Math.min(180, west));
      east = Math.max(-180, Math.min(180, east));
      south = Math.max(-89.9, Math.min(89.9, south));
      north = Math.max(-89.9, Math.min(89.9, north));
      if (west >= east) {
        west = -180;
        east = 180;
      }
      if (south >= north) {
        south = -89.9;
        north = 89.9;
      }
    }
    const bboxParam = `${west},${south},${east},${north}`;
    const zoomParam = currentZoom !== null ? `&zoom=${currentZoom}` : "";
    const categoryParam = selectedCategory
      ? `&category=${encodeURIComponent(selectedCategory)}`
      : "";
    const isSponsorshipActive =
      sponsorshipOnly || activeDirectoryTab === "sponsors";
    const sponsorshipParam = isSponsorshipActive ? "&sponsorship=true" : "";
    const regionalParam = regionalOnly ? "&regional=true" : "";
    const hiringParam = hiringOnly ? "&hiring=true" : "";
    const roleFamilyParam = selectedRoleFamily
      ? `&role_family=${encodeURIComponent(selectedRoleFamily)}`
      : "";
    const workStyleParam = selectedWorkStyle
      ? `&work_style=${encodeURIComponent(selectedWorkStyle)}`
      : "";
    fetch(
      `/api/map/companies?bbox=${bboxParam}${zoomParam}${categoryParam}${sponsorshipParam}${regionalParam}${hiringParam}${roleFamilyParam}${workStyleParam}`,
    )
      .then((response) => response.json())
      .then((body: { points?: MapCompanyPoint[] }) =>
        setPoints(body.points ?? []),
      )
      .catch(() => {
        /* keep showing the last-known points rather than clearing the map */
      });
  }, [
    triggerBboxSearch,
    currentBbox,
    currentZoom,
    selectedCategory,
    sponsorshipOnly,
    activeDirectoryTab,
    regionalOnly,
    hiringOnly,
    selectedRoleFamily,
    selectedWorkStyle,
  ]);

  const handlePointClick = useCallback(
    (slug: string) => {
      isFocusingPointRef.current = true;
      setSelectedSlug(slug);
      handleTabChange("companies");
      trackEvent("map_company_clicked", { slug });

      const scrollCard = () => {
        const cardEl = document.getElementById(`company-card-${slug}`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      };
      setTimeout(scrollCard, 50);
      setTimeout(scrollCard, 200);
    },
    [handleTabChange],
  );

  const isSearching = query.trim() !== "";
  const rawListEntries = isSearching
    ? searchResultsToListEntries(searchResults ?? [])
    : pointsToListEntries(points);

  const availableRoleFamilies = useMemo(() => {
    const set = new Set<string>();
    for (const entry of rawListEntries) {
      if (entry.topRoleFamilies) {
        for (const rf of entry.topRoleFamilies) {
          set.add(rf);
        }
      }
    }
    return Array.from(set).sort();
  }, [rawListEntries]);

  const hiringCount = useMemo(
    () => rawListEntries.filter((e) => (e.activeJobsCount ?? 0) > 0).length,
    [rawListEntries],
  );

  // Apply regional, hiring, role family, and work style filters on the list view
  const listEntries = useMemo(() => {
    let entries = rawListEntries;
    if (regionalOnly) {
      entries = entries.filter((entry) => entry.isRegional);
    }
    if (hiringOnly) {
      entries = entries.filter((entry) => (entry.activeJobsCount ?? 0) > 0);
    }
    if (selectedRoleFamily) {
      entries = entries.filter(
        (entry) =>
          entry.topRoleFamilies &&
          entry.topRoleFamilies.some(
            (rf) => rf.toLowerCase() === selectedRoleFamily.toLowerCase(),
          ),
      );
    }
    if (selectedWorkStyle) {
      entries = entries.filter(
        (entry) =>
          entry.workStyles && entry.workStyles.includes(selectedWorkStyle),
      );
    }
    return entries;
  }, [
    rawListEntries,
    regionalOnly,
    hiringOnly,
    selectedRoleFamily,
    selectedWorkStyle,
  ]);

  // Verified sponsorship count across currently loaded records
  const sponsoredCount = useMemo(
    () => rawListEntries.filter((e) => e.hasSponsorshipEvidence).length,
    [rawListEntries],
  );

  // Tab-filtered entries for display
  const displayedEntries = useMemo(() => {
    if (activeDirectoryTab === "sponsors") {
      return listEntries.filter((entry) => entry.hasSponsorshipEvidence);
    }
    return listEntries;
  }, [listEntries, activeDirectoryTab]);

  // Apply regional-only, hiring, role family, work style, and visa-sponsor filter to map points as well
  const displayedPoints = useMemo(() => {
    let pts = points;
    if (regionalOnly) {
      pts = pts.filter((point) => point.isRegional);
    }
    if (hiringOnly) {
      pts = pts.filter((point) => (point.activeJobsCount ?? 0) > 0);
    }
    if (selectedRoleFamily) {
      pts = pts.filter(
        (point) =>
          point.topRoleFamilies &&
          point.topRoleFamilies.some(
            (rf) => rf.toLowerCase() === selectedRoleFamily.toLowerCase(),
          ),
      );
    }
    if (selectedWorkStyle) {
      pts = pts.filter(
        (point) =>
          point.workStyles && point.workStyles.includes(selectedWorkStyle),
      );
    }
    if (activeDirectoryTab === "sponsors") {
      pts = pts.filter((point) => point.hasSponsorshipEvidence);
    }
    if (activeDirectoryTab === "regions") {
      pts = pts.filter((point) => point.isRegional);
    }
    return pts;
  }, [
    points,
    regionalOnly,
    hiringOnly,
    selectedRoleFamily,
    selectedWorkStyle,
    activeDirectoryTab,
  ]);

  const selectedEntry = useMemo<ListEntry | null>(() => {
    if (!selectedSlug) return null;
    const foundInList =
      listEntries.find((entry) => entry.slug === selectedSlug) ??
      rawListEntries.find((entry) => entry.slug === selectedSlug);
    if (foundInList) return foundInList;

    const pt =
      displayedPoints.find((p) => p.slug === selectedSlug) ??
      points.find((p) => p.slug === selectedSlug) ??
      initialPoints.find((p) => p.slug === selectedSlug);
    if (pt) {
      return {
        slug: pt.slug,
        name: pt.name,
        domain: extractDomainFromUrl(pt.careersUrl, pt.slug),
        careersUrl: pt.careersUrl,
        city: pt.city,
        primaryCategory: pt.primaryCategory,
        hasSponsorshipEvidence: pt.hasSponsorshipEvidence,
        isRegional: pt.isRegional,
        activeJobsCount: pt.activeJobsCount,
        topRoleFamilies: pt.topRoleFamilies,
        workStyles: pt.workStyles,
      };
    }
    return null;
  }, [
    selectedSlug,
    listEntries,
    rawListEntries,
    displayedPoints,
    points,
    initialPoints,
  ]);

  // Ensure the selected company is ALWAYS present in the rendered list entries
  const finalDisplayedEntries = useMemo(() => {
    let entries = displayedEntries;
    if (
      selectedEntry &&
      !entries.some((entry) => entry.slug === selectedEntry.slug)
    ) {
      entries = [selectedEntry, ...entries];
    }
    return entries;
  }, [displayedEntries, selectedEntry]);

  const handleResetFilters = () => {
    setQuery("");
    setSearchResults(null);
    setSelectedCategory("");
    setSponsorshipOnly(false);
    setRegionalOnly(false);
    setHiringOnly(false);
    setSelectedRoleFamily("");
    setSelectedWorkStyle("");
    setActiveHubCity(null);
    setSelectedSlug(null);
    setCameraTarget({
      center: [133.7751, -25.2744],
      zoom: 4,
      timestamp: Date.now(),
    });
  };

  const handleSelectHub = (hub: DisplayedHub) => {
    if (activeHubCity === hub.city) {
      setActiveHubCity(null);
      setQuery("");
      handleTabChange("regions");
      setCameraTarget({
        center: [133.7751, -25.2744],
        zoom: 4,
        timestamp: Date.now(),
      });
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("hub");
        url.searchParams.set("tab", "regions");
        window.history.replaceState(null, "", url.toString());
      }
      return;
    }
    setActiveHubCity(hub.city);
    setCameraTarget({
      center: hub.center,
      zoom: hub.zoom,
      timestamp: Date.now(),
    });
    setQuery("");
    handleTabChange("companies");
    setShowMapMobile(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("hub", hub.city);
      url.searchParams.delete("tab");
      window.history.replaceState(null, "", url.toString());
    }
    trackEvent("regional_hub_selected", { city: hub.city });

    // Scroll smoothly to directory controls
    const el = document.getElementById("directory-content");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const hasActiveFilters =
    query.trim() !== "" ||
    selectedCategory !== "" ||
    sponsorshipOnly ||
    regionalOnly ||
    hiringOnly ||
    selectedRoleFamily !== "" ||
    selectedWorkStyle !== "" ||
    activeHubCity !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Unified Ultra-Compact Command Bar (Single Row, Sticky) */}
      <div className="sticky top-0 z-30 bg-canvas/95 backdrop-blur-md py-1">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 rounded-2xl border border-surface-border bg-white px-3 py-2 shadow-2xs">
          {/* Main Search Input */}
          <div className="relative flex-1 flex items-center min-w-[200px]">
            <span className="pointer-events-none absolute left-3 text-slate-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              ref={searchInputRef}
              type="search"
              name="q"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              suppressHydrationWarning
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (activeHubCity && event.target.value !== activeHubCity) {
                  setActiveHubCity(null);
                }
              }}
              placeholder="Search companies, roles, cities... (Press ⌘K)"
              className="w-full rounded-xl border border-slate-200/90 bg-slate-50/80 py-1.5 pr-14 pl-9 text-xs sm:text-sm font-medium text-navy-900 placeholder:text-slate-400 focus:border-navy-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900/15 transition-all"
            />
            <div className="absolute right-2.5 flex items-center gap-1">
              {query.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveHubCity(null);
                    searchInputRef.current?.focus();
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
                  aria-label="Clear query"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-400 shadow-2xs">
                  ⌘K
                </kbd>
              )}
            </div>
          </div>

          {/* Inline Filter Controls (Single non-wrapping row) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap shrink-0 py-0.5">
            {/* Actively hiring button */}
            <button
              type="button"
              onClick={() => setHiringOnly(!hiringOnly)}
              aria-pressed={hiringOnly}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                hiringOnly
                  ? "border border-emerald-700 bg-emerald-700 text-white shadow-xs"
                  : "border border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {hiringOnly && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-200 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    hiringOnly ? "bg-white" : "bg-emerald-500"
                  }`}
                />
              </span>
              <span className="hidden sm:inline">Actively hiring</span>
              <span className="sm:hidden">Hiring</span>
              {hiringCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-bold ${
                    hiringOnly
                      ? "bg-white/20 text-white"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {hiringCount}
                </span>
              )}
            </button>

            {/* Sponsorship Toggle */}
            <button
              type="button"
              onClick={() => setSponsorshipOnly(!sponsorshipOnly)}
              aria-pressed={sponsorshipOnly}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                sponsorshipOnly
                  ? "border border-navy-900 bg-navy-900 text-white shadow-xs"
                  : "border border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs"
              }`}
            >
              <ShieldCheck
                className={`h-3.5 w-3.5 ${
                  sponsorshipOnly ? "text-white" : "text-slate-400"
                }`}
              />
              <span>482 Visas</span>
            </button>

            {/* Regional Only Toggle */}
            <button
              type="button"
              onClick={() => setRegionalOnly(!regionalOnly)}
              aria-pressed={regionalOnly}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                regionalOnly
                  ? "border border-navy-900 bg-navy-900 text-white shadow-xs"
                  : "border border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs"
              }`}
            >
              <Compass
                className={`h-3.5 w-3.5 ${
                  regionalOnly ? "text-white" : "text-slate-400"
                }`}
              />
              <span>Regional</span>
            </button>

            {/* Sector Category Dropdown */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5 hover:border-slate-300 transition-colors shrink-0">
              <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs font-semibold text-navy-900 bg-transparent focus:outline-none cursor-pointer max-w-[110px] sm:max-w-[130px] truncate"
              >
                <option value="">All sectors</option>
                {categoryGroups.map((group) => (
                  <optgroup key={group.groupLabel} label={group.groupLabel}>
                    {group.items.map((cat) => (
                      <option key={cat.key} value={cat.key}>
                        {cat.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Work Style Dropdown */}
            <div className="hidden lg:flex items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-50/80 px-2.5 py-1.5 hover:border-slate-300 transition-colors shrink-0">
              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <select
                value={selectedWorkStyle}
                onChange={(e) =>
                  setSelectedWorkStyle(
                    e.target.value as "remote" | "hybrid" | "onsite" | "",
                  )
                }
                className="text-xs font-semibold text-navy-900 bg-transparent focus:outline-none cursor-pointer max-w-[100px] truncate"
              >
                <option value="">Work style</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </div>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-transparent hover:border-terracotta-200 px-2.5 py-1.5 text-xs font-semibold text-terracotta-700 hover:bg-terracotta-50 transition-colors"
                title="Reset all filters"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            )}

            {/* Save Search CTA */}
            <button
              type="button"
              onClick={() => {
                setSaveSearchName(computeDefaultSearchName());
                setSaveErrorMessage(null);
                setSaveSuccessMessage(null);
                setShowSaveModal(true);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shadow-2xs"
              title="Save current search criteria and set opportunity alerts"
            >
              <Bookmark className="h-3.5 w-3.5 text-terracotta-700" />
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/50 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl border border-surface-border bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setShowSaveModal(false)}
              className="absolute top-4 right-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-terracotta-50 text-terracotta-700 border border-terracotta-200/80">
                <Bookmark className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-heading text-base font-bold text-navy-900">
                  Save Opportunity Search
                </h3>
                <p className="text-xs text-slate-500">
                  Bookmark these criteria &amp; receive verified vacancy alerts
                </p>
              </div>
            </div>

            {saveSuccessMessage ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600 mb-1" />
                <p className="text-xs font-bold text-emerald-900">
                  {saveSuccessMessage}
                </p>
              </div>
            ) : !currentUser ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Signing in with your email lets you save search criteria,
                    track companies and regional hubs, and receive low-noise
                    opportunity alerts.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    className="rounded-xl border border-surface-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <Link
                    href="/sign-in?callbackUrl=/"
                    className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
                  >
                    Sign in to Save
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveSearchSubmit} className="space-y-4">
                {saveErrorMessage && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    {saveErrorMessage}
                  </div>
                )}

                <div>
                  <label className="block font-heading text-xs font-bold text-navy-900 mb-1">
                    Search Name
                  </label>
                  <input
                    type="text"
                    required
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    placeholder="e.g. Adelaide Space & AI Companies"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-navy-900 placeholder:text-slate-400 focus:border-navy-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900/15"
                  />
                </div>

                <div>
                  <label className="block font-heading text-xs font-bold text-navy-900 mb-1">
                    Alert Frequency
                  </label>
                  <select
                    value={saveAlertFrequency}
                    onChange={(e) =>
                      setSaveAlertFrequency(e.target.value as AlertFrequency)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-navy-900 focus:border-navy-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-900/15 cursor-pointer"
                  >
                    <option value="never">In-App Only (No email digest)</option>
                    <option value="daily">Daily Opportunity Digest</option>
                    <option value="weekly">Weekly Opportunity Digest</option>
                    <option value="instant">
                      Instant Updates (Material changes)
                    </option>
                  </select>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <span className="block font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Active Filters:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {query && (
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                        Query: &quot;{query}&quot;
                      </span>
                    )}
                    {activeHubCity && (
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                        Hub: {activeHubCity}
                      </span>
                    )}
                    {selectedCategory && (
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                        Sector: {selectedCategory}
                      </span>
                    )}
                    {sponsorshipOnly && (
                      <span className="rounded bg-terracotta-50 text-terracotta-800 px-2 py-0.5 text-[10px] font-medium border border-terracotta-200">
                        482 Sponsor
                      </span>
                    )}
                    {regionalOnly && (
                      <span className="rounded bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-medium border border-emerald-200">
                        Regional
                      </span>
                    )}
                    {hiringOnly && (
                      <span className="rounded bg-emerald-50 text-emerald-800 px-2 py-0.5 text-[10px] font-medium border border-emerald-200">
                        Actively Hiring
                      </span>
                    )}
                    {selectedRoleFamily && (
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                        Role: {selectedRoleFamily}
                      </span>
                    )}
                    {selectedWorkStyle && (
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 border border-slate-200">
                        Work style: {selectedWorkStyle}
                      </span>
                    )}
                    {!query &&
                      !activeHubCity &&
                      !selectedCategory &&
                      !sponsorshipOnly &&
                      !regionalOnly &&
                      !hiringOnly &&
                      !selectedRoleFamily &&
                      !selectedWorkStyle && (
                        <span className="text-[11px] text-slate-500 italic">
                          All verified technology employers in Australia
                        </span>
                      )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(false)}
                    disabled={isSavingSearch}
                    className="rounded-xl border border-surface-border px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingSearch}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-terracotta-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-terracotta-800 transition-colors disabled:opacity-70"
                  >
                    {isSavingSearch && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    )}
                    <span>Save Search</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Screen reader live region */}
      <div aria-live="polite" className="sr-only">
        {isSearching
          ? `Searching… found ${listEntries.length} results.`
          : `${listEntries.length} employers in view.`}
      </div>

      {/* 2. Synchronized Studio Split: Directory Feed (Left) & Sticky Map (Right) */}
      <div
        id="directory-content"
        className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
      >
        {/* Left Column (5 of 12): Permanent Company Directory Feed */}
        <div
          className={`lg:col-span-5 flex flex-col gap-2.5 ${
            showMapMobile ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Active Region Hub Breadcrumb Banner */}
          {activeHubCity && (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-surface-border px-3 py-2 text-xs transition-all shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveHubCity(null);
                    setQuery("");
                    handleTabChange("regions");
                    setCameraTarget({
                      center: [133.7751, -25.2744],
                      zoom: 4,
                      timestamp: Date.now(),
                    });
                    if (typeof window !== "undefined") {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("hub");
                      url.searchParams.set("tab", "regions");
                      window.history.replaceState(null, "", url.toString());
                    }
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800 hover:underline shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All regions
                </button>
                <span className="text-slate-300">•</span>
                <span className="truncate font-bold text-navy-900">
                  📍 {activeHubCity} Hub
                </span>
              </div>
              <span className="font-mono text-[11px] font-medium text-slate-600 shrink-0">
                {listEntries.length}{" "}
                {listEntries.length === 1 ? "employer" : "employers"}
              </span>
            </div>
          )}

          {/* Section Tabs: Companies | Visa Sponsors | Regions */}
          <div className="flex items-center justify-between border-b border-surface-border pb-2.5">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => handleTabChange("companies")}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeDirectoryTab === "companies"
                    ? "bg-navy-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
                }`}
              >
                <span>Companies</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    activeDirectoryTab === "companies"
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/80 text-slate-700"
                  }`}
                >
                  {listEntries.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("sponsors")}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeDirectoryTab === "sponsors"
                    ? "bg-navy-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
                }`}
              >
                <span>Visa Sponsors</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    activeDirectoryTab === "sponsors"
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/80 text-slate-700"
                  }`}
                >
                  {sponsoredCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("regions")}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  activeDirectoryTab === "regions"
                    ? "bg-navy-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-navy-900 hover:bg-slate-100"
                }`}
              >
                <span>Regions</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    activeDirectoryTab === "regions"
                      ? "bg-white/20 text-white"
                      : "bg-slate-200/80 text-slate-700"
                  }`}
                >
                  {displayedHubs.length}
                </span>
              </button>
            </div>
            <span className="whitespace-nowrap font-mono text-[11px] text-slate-500 font-medium shrink-0 hidden sm:inline">
              {activeDirectoryTab === "regions"
                ? `${displayedHubs.length} ${displayedHubs.length === 1 ? "hub" : "hubs"}`
                : `${finalDisplayedEntries.length} in view`}
            </span>
          </div>

          {/* Feed Content */}
          <div className="flex h-[calc(100vh-240px)] min-h-[440px] max-h-[570px] flex-col gap-2.5 overflow-y-auto pr-2 pb-16 lg:pb-0 custom-scrollbar">
            {searchError && (
              <p className="rounded-xl border border-red-600/40 bg-red-50 p-3 text-xs font-medium text-red-900">
                Search is temporarily unavailable. Please retry.
              </p>
            )}

            {/* If Regions Tab is Active */}
            {activeDirectoryTab === "regions" && (
              <div className="flex flex-col gap-2.5">
                {/* Featured Regional Hubs Illustrated Map Banner */}
                <div className="relative overflow-hidden rounded-2xl border border-surface-border bg-gradient-to-b from-slate-50 to-white p-3 shadow-2xs">
                  <div className="relative h-44 sm:h-52 w-full overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
                    <Image
                      src="/assets/australia_hubs_map.png"
                      alt="Australia Regional Innovation Corridors"
                      fill
                      className="object-contain p-2 hover:scale-[1.02] transition-transform duration-500 ease-out"
                      priority
                    />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between px-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-terracotta-700 animate-pulse" />
                        <span className="font-heading text-xs font-bold text-navy-900 tracking-wide uppercase">
                          National Innovation Corridors
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {displayedHubs.length} designated regional tech hubs
                        across Australia. Click any hub to explore local
                        employers.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Regional Hub Cards or Empty State */}
                {displayedHubs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center shadow-2xs">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200/80 text-slate-500 mb-2.5">
                      <Compass className="h-5 w-5" />
                    </div>
                    <p className="font-heading text-sm font-bold text-navy-900">
                      No regional hubs matching &ldquo;{query}&rdquo;
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                      Try searching by state (e.g. WA, NSW, QLD), city name, or technology sector.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setActiveHubCity(null);
                      }}
                      className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-navy-900 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3 text-slate-500" />
                      <span>View all regional hubs</span>
                    </button>
                  </div>
                ) : (
                  displayedHubs.map((hub) => {
                    const isActive = activeHubCity === hub.city;
                    return (
                      <div
                        key={hub.city}
                        onClick={() => handleSelectHub(hub)}
                        className={`group relative flex flex-col gap-2 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                          isActive
                            ? "border-navy-900 bg-slate-50 shadow-xs ring-1 ring-navy-900/10"
                            : "border-surface-border bg-white hover:border-slate-300 hover:bg-slate-50/50"
                        }`}
                      >
                        {/* Active Indicator Strip */}
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-terracotta-700"
                          />
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                                isActive
                                  ? "bg-navy-900 text-white border-navy-900"
                                  : "bg-slate-50 text-navy-900 border-surface-border"
                              }`}
                            >
                              <hub.icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-heading text-sm font-bold text-navy-900 truncate">
                                  {hub.city}
                                </span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 uppercase">
                                  {hub.state}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 line-clamp-1">
                                {hub.tag}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                            <span className="font-bold text-navy-900">
                              {hub.count}
                            </span>
                            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-navy-900 transition-all" />
                          </div>
                        </div>

                        {hub.sa4Code && (
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <span className="text-[11px] text-slate-400 font-mono">
                              ABS SA4 {hub.sa4Code}
                            </span>
                            <Link
                              href={`/regions/${hub.sa4Code}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800 hover:underline transition-colors"
                            >
                              <span>Labour &amp; Opportunity Report</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* If Companies or Sponsors Tab is Active */}
            {activeDirectoryTab !== "regions" && (
              <>
                {finalDisplayedEntries.length === 0 ? (
                  <div className="rounded-xl border border-surface-border bg-white p-6 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-700">
                      {activeDirectoryTab === "sponsors"
                        ? "No visa-sponsored employers match this current view or query."
                        : "No companies match this query."}
                    </p>
                    {activeDirectoryTab === "sponsors" && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          setActiveHubCity(null);
                          setRegionalOnly(false);
                          setCameraTarget({
                            center: [133.7751, -25.2744],
                            zoom: 4,
                            timestamp: Date.now(),
                          });
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-all shadow-2xs"
                      >
                        <Award className="h-3.5 w-3.5 text-slate-300" />
                        View all nationwide visa sponsors
                      </button>
                    )}
                  </div>
                ) : (
                  finalDisplayedEntries.map((entry) => {
                    const isSelected = entry.slug === selectedSlug;
                    const pt = points.find((p) => p.slug === entry.slug);

                    return (
                      <div
                        key={entry.slug}
                        id={`company-card-${entry.slug}`}
                        onClick={() => {
                          handlePointClick(entry.slug);
                          setShowMapMobile(true);
                          if (pt) {
                            setCameraTarget({
                              center: [pt.lng, pt.lat],
                              zoom: Math.max(currentZoom ?? 12, 12),
                              padding:
                                typeof window !== "undefined" &&
                                window.innerWidth >= 640
                                  ? { top: 0, bottom: 0, left: 320, right: 0 }
                                  : undefined,
                              timestamp: Date.now(),
                            });
                          }
                        }}
                        className={`group relative flex items-start gap-3.5 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-navy-900 bg-slate-50/60 shadow-sm ring-1 ring-navy-900/10"
                            : "border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs hover:bg-slate-50/40"
                        }`}
                      >
                        {/* Selected Indicator Strip */}
                        {isSelected && (
                          <span
                            aria-hidden="true"
                            className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-terracotta-700"
                          />
                        )}
                        {/* Company Brand Logo */}
                        <CompanyBrandMark
                          slug={entry.slug}
                          name={entry.name}
                          domain={entry.domain}
                          careersUrl={entry.careersUrl}
                          size="md"
                        />

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-heading text-sm font-bold text-navy-900 truncate group-hover:text-terracotta-700 transition-colors">
                              {entry.name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-navy-900 text-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-2xs">
                                  Selected
                                </span>
                              )}
                              {entry.activeJobsCount &&
                              entry.activeJobsCount > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 shadow-2xs">
                                  <Zap className="h-2.5 w-2.5 text-emerald-600 fill-emerald-600 shrink-0" />
                                  {entry.activeJobsCount} live{" "}
                                  {entry.activeJobsCount === 1
                                    ? "role"
                                    : "roles"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-800 shadow-2xs">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                                  Verified
                                </span>
                              )}
                              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 group-hover:text-navy-900 transition-all" />
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {formatLocation(entry.city)}
                            </span>
                            {entry.primaryCategory && (
                              <>
                                <span className="text-slate-300">•</span>
                                <CategoryBadge
                                  category={entry.primaryCategory}
                                  size="sm"
                                />
                              </>
                            )}
                          </div>

                          {/* Role Families & Work Style Tags */}
                          {entry.topRoleFamilies &&
                            entry.topRoleFamilies.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                {entry.topRoleFamilies.slice(0, 3).map((rf) => (
                                  <span
                                    key={rf}
                                    className="rounded bg-slate-100/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-600"
                                  >
                                    {rf}
                                  </span>
                                ))}
                                {entry.workStyles &&
                                  entry.workStyles.includes("remote") && (
                                    <span className="rounded bg-sky-50 text-sky-700 border border-sky-200/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                                      Remote
                                    </span>
                                  )}
                              </div>
                            )}

                          {entry.hasSponsorshipEvidence && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-slate-800 shadow-2xs">
                                <Award className="h-2.5 w-2.5 text-slate-600 shrink-0" />
                                Subclass 482 Sponsor
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Column (7 of 12): Sticky Living Cartographic Canvas */}
        <div
          className={`lg:col-span-7 sticky top-4 ${
            showMapMobile ? "block" : "hidden lg:block"
          }`}
        >
          <div className="relative h-[calc(100vh-240px)] min-h-[440px] max-h-[570px] overflow-hidden rounded-2xl border border-surface-border bg-slate-100 shadow-2xs">
            <MapCanvas
              points={displayedPoints}
              initialBbox={initialBbox}
              cameraTarget={cameraTarget}
              selectedSlug={selectedSlug}
              onMoveEnd={handleMoveEnd}
              onPointClick={handlePointClick}
            />

            {/* Bottom-Left Floating Toggle: Search as map moves */}
            <div className="absolute bottom-3.5 left-3.5 z-10 flex items-center rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-md px-3 py-1.5 shadow-md">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-navy-900">
                <input
                  type="checkbox"
                  checked={searchAsMapMoves}
                  onChange={(e) => setSearchAsMapMoves(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-terracotta-700 focus:ring-terracotta-700/30 accent-terracotta-700 cursor-pointer"
                />
                <span>Search as map moves</span>
              </label>
            </div>

            {/* Top-Center Floating Action Button: Search this area */}
            {hasMovedMapSinceSearch && !searchAsMapMoves && (
              <div className="absolute top-3.5 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
                <button
                  type="button"
                  onClick={executeBboxSearch}
                  className="inline-flex items-center gap-1.5 rounded-full border border-terracotta-600 bg-terracotta-700 px-4 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-terracotta-800 active:scale-95 transition-all"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search this area</span>
                </button>
              </div>
            )}

            {/* Top-Right Floating Zoom & Recenter Controls */}
            <div className="absolute top-3.5 right-3.5 z-10 flex flex-col items-center rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-1 shadow-md">
              <button
                type="button"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                title="Zoom in"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-navy-900 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
              <div className="h-px w-5 bg-slate-200 my-0.5" />
              <button
                type="button"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                title="Zoom out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-navy-900 transition-colors"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="h-px w-5 bg-slate-200 my-0.5" />
              <button
                type="button"
                onClick={handleRecenter}
                aria-label="Recenter Australia"
                title="Recenter Australia"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-navy-900 transition-colors group"
              >
                <Crosshair className="h-4 w-4 text-terracotta-700 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {/* Floating In-Map Company Detail Card */}
            {selectedEntry &&
              (() => {
                const pt =
                  displayedPoints.find((p) => p.slug === selectedEntry.slug) ??
                  points.find((p) => p.slug === selectedEntry.slug);

                return (
                  <div className="absolute top-3 left-3 z-30 animate-slide-down w-[300px] sm:w-[320px] max-w-[calc(100%-24px)] rounded-xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-3 shadow-lg">
                    {/* Header with Avatar, Title, Location & Close */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <CompanyBrandMark
                          slug={selectedEntry.slug}
                          name={selectedEntry.name}
                          domain={selectedEntry.domain}
                          careersUrl={selectedEntry.careersUrl}
                          size="sm"
                        />
                        <div className="flex flex-col min-w-0">
                          <h3 className="font-heading text-sm font-bold tracking-tight text-navy-900 truncate">
                            {selectedEntry.name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-0.5">
                            {selectedEntry.city && (
                              <span className="flex items-center gap-1 font-medium text-slate-700 truncate">
                                <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="truncate">
                                  {formatLocation(selectedEntry.city)}
                                </span>
                              </span>
                            )}
                            {selectedEntry.primaryCategory && (
                              <>
                                <span className="text-slate-300">•</span>
                                <CategoryBadge
                                  category={selectedEntry.primaryCategory}
                                  size="sm"
                                />
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Close Button */}
                      <button
                        type="button"
                        onClick={() => setSelectedSlug(null)}
                        aria-label="Close employer details"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-navy-900 transition-colors cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Status badges strip */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-800 uppercase tracking-wider shadow-2xs">
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 shrink-0" />
                        Verified
                      </span>
                      {selectedEntry.hasSponsorshipEvidence && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-800 shadow-2xs">
                          <Award className="h-2.5 w-2.5 text-slate-600 shrink-0" />
                          482 Sponsor
                        </span>
                      )}
                      {selectedEntry.activeJobsCount &&
                        selectedEntry.activeJobsCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shadow-2xs">
                            <Zap className="h-2.5 w-2.5 text-emerald-600 fill-emerald-600 shrink-0" />
                            {selectedEntry.activeJobsCount} Live{" "}
                            {selectedEntry.activeJobsCount === 1
                              ? "Role"
                              : "Roles"}
                          </span>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-100">
                      <Link
                        href={`/companies/${selectedEntry.slug}`}
                        className="flex-1 inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 transition-colors shadow-2xs group"
                      >
                        <span>Full profile</span>
                        <ArrowRight className="h-3 w-3 text-white/80 group-hover:translate-x-0.5 transition-transform" />
                      </Link>

                      {selectedEntry.careersUrl && (
                        <a
                          href={selectedEntry.careersUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            trackEvent("careers_link_clicked", {
                              slug: selectedEntry.slug,
                            })
                          }
                          className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-900 hover:bg-slate-50 transition-colors shadow-2xs"
                          title="Open Careers Portal"
                        >
                          <span>Careers</span>
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                        </a>
                      )}

                      {pt && (
                        <button
                          type="button"
                          onClick={() => {
                            isFocusingPointRef.current = true;
                            setCameraTarget({
                              center: [pt.lng, pt.lat],
                              zoom: 14,
                              padding:
                                typeof window !== "undefined" &&
                                window.innerWidth >= 640
                                  ? { top: 0, bottom: 0, left: 320, right: 0 }
                                  : undefined,
                              timestamp: Date.now(),
                            });
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 hover:text-navy-900 transition-colors shadow-2xs shrink-0"
                          title="Focus marker on map"
                        >
                          <Crosshair className="h-3.5 w-3.5 text-terracotta-700" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

          </div>
        </div>
      </div>

      {/* Mobile Floating Toggle */}
      <div className="fixed inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
        <div className="inline-flex rounded-full border border-surface-border bg-navy-950/90 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setShowMapMobile(false)}
            aria-pressed={!showMapMobile}
            className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 transition-colors duration-150 motion-reduce:transition-none ${
              !showMapMobile
                ? "bg-terracotta-700 text-white shadow-xs"
                : "text-slate-300 hover:text-white"
            }`}
          >
            {activeDirectoryTab === "regions"
              ? `Hubs (${displayedHubs.length})`
              : `List (${listEntries.length})`}
          </button>
          <button
            type="button"
            onClick={() => setShowMapMobile(true)}
            aria-pressed={showMapMobile}
            className={`rounded-full px-4 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 transition-colors duration-150 motion-reduce:transition-none ${
              showMapMobile
                ? "bg-terracotta-700 text-white shadow-xs"
                : "text-slate-300 hover:text-white"
            }`}
          >
            Map view
          </button>
        </div>
      </div>
    </div>
  );
}
