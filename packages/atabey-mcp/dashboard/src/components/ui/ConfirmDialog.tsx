import React from "react";
import { AlertTriangle, AlertCircle, Info, HelpCircle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

export type ConfirmType = "danger" | "warning" | "info" | "question";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: ConfirmType;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  type = "warning",
  isLoading = false,
}: ConfirmDialogProps) {
  const icons = {
    danger: <AlertCircle className="w-6 h-6 text-rose-400" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-400" />,
    info: <Info className="w-6 h-6 text-cyan-400" />,
    question: <HelpCircle className="w-6 h-6 text-purple-400" />,
  };

  const confirmVariants = {
    danger: "danger" as const,
    warning: "primary" as const,
    info: "cyan" as const,
    question: "primary" as const,
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="md">
      <div className="flex items-start gap-4 py-2">
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
          {icons[type]}
        </div>
        <div className="space-y-1.5 flex-1">
          <h3 className="text-base font-semibold text-text-primary tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-text-secondary leading-relaxed">
            {message}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariants[type]}
          size="sm"
          onClick={() => {
            onConfirm();
          }}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
