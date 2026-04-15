"use client";

import { useTransition } from "react";
import { deleteBulletinPost, togglePinPost } from "./actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Pin, PinOff, Trash2 } from "lucide-react";
import type { UserRole } from "@/lib/types";

interface BulletinActionsProps {
  postId: string;
  authorId: string;
  isPinned: boolean;
  currentUserId: string;
  currentUserRole: UserRole;
}

export function BulletinActions({
  postId,
  authorId,
  isPinned,
  currentUserId,
  currentUserRole,
}: BulletinActionsProps) {
  const [, startTransition] = useTransition();
  const isAdmin = currentUserRole === "admin";
  const isOwner = currentUserId === authorId;

  if (!isAdmin && !isOwner) return null;

  function handleDelete() {
    if (confirm("Delete this post? This cannot be undone.")) {
      startTransition(() => {
        deleteBulletinPost(postId);
      });
    }
  }

  function handleTogglePin() {
    startTransition(() => {
      togglePinPost(postId);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isAdmin && (
          <DropdownMenuItem onClick={handleTogglePin}>
            {isPinned ? (
              <>
                <PinOff className="mr-2 h-4 w-4" />
                Unpin
              </>
            ) : (
              <>
                <Pin className="mr-2 h-4 w-4" />
                Pin to Top
              </>
            )}
          </DropdownMenuItem>
        )}
        {(isOwner || isAdmin) && (
          <DropdownMenuItem onClick={handleDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
