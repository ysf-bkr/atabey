import React from "react";
import { Search, X } from "lucide-react";
import { Button } from "./Button";

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  totalResults?: number;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  children,
  onClearFilters,
  hasActiveFilters = false,
  totalResults,
}: FilterBarProps) {
  return (
    <div className="glass-panel p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
      {/* Search Bar Input */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-8 py-2 rounded-lg bg-background-surface/90 border border-white/10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-purple/40 focus:border-brand-purple transition-all"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Slots + Actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {children}

        {hasActiveFilters && onClearFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-xs text-text-muted hover:text-text-primary"
            leftIcon={<X size={12} />}
          >
            Clear
          </Button>
        )}

        {totalResults !== undefined && (
          <span className="text-xs font-mono text-text-muted px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
            {totalResults} items
          </span>
        )}
      </div>
    </div>
  );
}
