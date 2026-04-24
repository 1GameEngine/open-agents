"use client";

import { Coins, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePointsBalance } from "@/hooks/use-points-balance";
import { useSession } from "@/hooks/use-session";

function handleSignOut() {
  // Use a form POST to trigger the signout
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/signout";
  document.body.appendChild(form);
  form.submit();
}

export function UserAvatarDropdown() {
  const { session } = useSession();
  const {
    balance,
    dailyMax,
    isLoading: balanceLoading,
    error: balanceError,
  } = usePointsBalance();

  if (!session?.user) {
    return null;
  }

  const balanceText =
    balanceError || balance === null || balanceLoading
      ? "…"
      : `${balance.toLocaleString("zh-CN")} / ${dailyMax.toLocaleString("zh-CN")}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer rounded-full hover:opacity-80"
        >
          <Avatar className="h-8 w-8">
            {session.user.avatar ? (
              <AvatarImage
                src={session.user.avatar}
                alt={session.user.username}
              />
            ) : null}
            <AvatarFallback className="bg-black" />
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="space-y-2 font-normal">
          <p className="truncate text-sm font-semibold leading-none">
            {session.user.username}
          </p>
          {session.user.email ? (
            <p className="truncate text-xs text-muted-foreground">
              {session.user.email}
            </p>
          ) : null}
          <Link
            href="/settings/points"
            className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Coins className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">今日积分 </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {balanceText}
              </span>
            </span>
          </Link>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings/points">
              <Coins className="mr-2 h-4 w-4" />
              积分明细
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
