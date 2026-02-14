"use client";

import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen, SquarePen, Trash2 } from "lucide-react";

interface ChatNavItem {
  id: string;
  title: string;
  updatedAt: number;
}

interface TopicNavProps {
  chats: ChatNavItem[];
  selectedId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClearHistory: () => void;
  onNewChat: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function chatSectionLabel(updatedAt: number): "Today" | "Yesterday" | "Earlier" {
  const now = new Date();
  const target = new Date(updatedAt);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startToday.getDate() - 1);
  if (target >= startToday) return "Today";
  if (target >= startYesterday) return "Yesterday";
  return "Earlier";
}

export function TopicNav({
  chats,
  selectedId,
  onSelectChat,
  onDeleteChat,
  onClearHistory,
  onNewChat,
  collapsed,
  onToggleCollapse,
}: TopicNavProps) {
  const grouped = chats.reduce<Record<"Today" | "Yesterday" | "Earlier", ChatNavItem[]>>(
    (acc, chat) => {
      acc[chatSectionLabel(chat.updatedAt)].push(chat);
      return acc;
    },
    { Today: [], Yesterday: [], Earlier: [] }
  );

  return (
    <div className="flex h-full flex-col border-r border-border">
      <div
        className={cn(
          "flex items-center border-b border-border py-3",
          collapsed ? "justify-center px-2" : "justify-between px-4"
        )}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={onNewChat}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="New chat"
              title="New chat"
            >
              <SquarePen className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Chats
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onNewChat}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="New chat"
                title="New chat"
              >
                <SquarePen className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClearHistory}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Clear history"
                title="Clear history"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onToggleCollapse}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {(["Today", "Yesterday", "Earlier"] as const).map((section) => {
          const items = grouped[section];
          if (items.length === 0) return null;
          return (
            <div key={section} className={cn("mb-3", collapsed ? "px-1.5" : "px-2")}>
              {!collapsed && (
                <p className="px-2 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {section}
                </p>
              )}
              <ul className="space-y-px">
                {items.map((chat) => {
                  const isSelected = selectedId === chat.id;
                  return (
                    <li key={chat.id}>
                      <button
                        type="button"
                        onClick={() => onSelectChat(chat.id)}
                        title={chat.title}
                        className={cn(
                          "flex w-full items-center rounded-md text-left text-sm transition-colors",
                          collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
                          isSelected
                            ? "bg-foreground text-background"
                            : "text-foreground hover:bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isSelected ? "bg-background" : "bg-muted-foreground/40"
                          )}
                        />
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{chat.title}</span>}
                        {!collapsed && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDeleteChat(chat.id);
                            }}
                            className={cn(
                              "rounded p-1 transition-colors",
                              isSelected
                                ? "text-background/80 hover:bg-background/20 hover:text-background"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                            aria-label={`Delete ${chat.title}`}
                            title="Delete chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
