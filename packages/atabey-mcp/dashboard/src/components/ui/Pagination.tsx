import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  totalEntries: number;
  pageSizeOptions?: number[];
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalEntries,
  pageSizeOptions = [10, 20, 50],
}: PaginationProps) {
  const startEntry = Math.min((currentPage - 1) * pageSize + 1, totalEntries);
  const endEntry = Math.min(currentPage * pageSize, totalEntries);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 px-1 text-xs text-text-secondary">
      {/* Entries Summary */}
      <div className="flex items-center gap-2">
        <span>
          Showing <span className="font-medium text-text-primary">{totalEntries > 0 ? startEntry : 0}</span> to{" "}
          <span className="font-medium text-text-primary">{endEntry}</span> of{" "}
          <span className="font-medium text-text-primary">{totalEntries}</span> entries
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-3">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-background-surface border border-white/10 rounded px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-brand-purple cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Pagination Navigation */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="h-8 px-2.5"
          leftIcon={<ChevronLeft size={14} />}
        >
          Previous
        </Button>

        <span className="px-3 py-1 font-mono text-xs rounded bg-white/[0.04] border border-white/[0.08] text-text-primary">
          {currentPage} / {Math.max(1, totalPages)}
        </span>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="h-8 px-2.5"
          rightIcon={<ChevronRight size={14} />}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
