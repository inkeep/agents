"use client";

import { Lock, LockOpen, Pencil } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { MCPTool } from "@/lib/api/tools";
import { getOAuthLoginUrl } from "@/lib/utils/mcp-urls";
import { getToolTypeAndName } from "@/lib/utils/mcp-utils";
import { Button } from "../ui/button";
import { AvailableToolsCard } from "./available-tools-card";
import { MCPToolImage } from "./mcp-tool-image";

export function ViewMCPServerDetails({
	tool,
	tenantId,
	projectId,
}: {
	tool: MCPTool;
	tenantId: string;
	projectId: string;
}) {
	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "healthy":
				return "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800";
			case "unhealthy":
				return "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800";
			case "disabled":
				return "bg-muted text-muted-foreground border-border";
			case "needs_auth":
				return "bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 border-amber-200 dark:border-amber-800";
			default:
				return "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800";
		}
	};

	// Handle OAuth login for MCP tools that need authentication
	const handleOAuthLogin = (toolId: string) => {
		try {
			// Get the OAuth URL and open in popup window
			const oauthUrl = getOAuthLoginUrl({ tenantId, projectId, id: toolId });
			const popup = window.open(
				oauthUrl,
				"oauth-popup",
				"width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes",
			);

			// Listen for OAuth success message from popup
			const handleMessage = (event: MessageEvent) => {
				if (
					event.data.type === "oauth-success" &&
					event.data.toolId === toolId
				) {
					// Clean up listener
					window.removeEventListener("message", handleMessage);
					// Refresh the page to show updated tool status
					window.location.reload();
				}
			};

			if (popup) {
				window.addEventListener("message", handleMessage);

				// Fallback: Monitor popup for closure
				const checkClosed = setInterval(() => {
					if (popup.closed) {
						clearInterval(checkClosed);
						window.removeEventListener("message", handleMessage);
						// Only refresh if we didn't already get the success message
						window.location.reload();
					}
				}, 1000);
			}
		} catch (error) {
			console.error("OAuth login failed:", error);
		}
	};

	let provider: string | undefined;
	try {
		provider = getToolTypeAndName(tool).type;
	} catch (error) {
		console.error(error);
	}

	return (
		<div className="max-w-2xl mx-auto py-4 space-y-8">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<MCPToolImage
						imageUrl={tool.imageUrl}
						name={tool.name}
						provider={provider}
						size={48}
						className="rounded-lg shadow-sm"
					/>
					<div>
						<h2 className="text-xl font-bold tracking-tight">{tool.name}</h2>
						<p className="text-sm text-muted-foreground">MCP Server Details</p>
					</div>
				</div>
				<Button asChild>
					<Link
						href={`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}/edit`}
					>
						<Pencil className="w-4 h-4" />
						Edit
					</Link>
				</Button>
			</div>

			{/* Basic Information */}
			<div className="space-y-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-2">
						<div className="text-sm font-medium leading-none">Name</div>
						<div className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
							{tool.name}
						</div>
					</div>
					<div className="space-y-2">
						<div className="text-sm font-medium leading-none">Status</div>
						<div className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm items-center">
							{tool.status === "needs_auth" ? (
								<Badge
									variant="outline"
									className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										handleOAuthLogin(tool.id);
									}}
								>
									Click to Login
								</Badge>
							) : (
								<Badge className={getStatusColor(tool.status)}>
									{tool.status}
								</Badge>
							)}
						</div>
					</div>
					<div className="space-y-2">
						<div className="text-sm font-medium leading-none">Created At</div>
						<div className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
							{formatDate(
								typeof tool.createdAt === "string"
									? tool.createdAt
									: tool.createdAt.toISOString(),
							)}
						</div>
					</div>
					<div className="space-y-2">
						<div className="text-sm font-medium leading-none">Updated At</div>
						<div className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
							{formatDate(
								typeof tool.updatedAt === "string"
									? tool.updatedAt
									: tool.updatedAt.toISOString(),
							)}
						</div>
					</div>
				</div>
				{tool.imageUrl && (
					<div className="space-y-2">
						<div className="text-sm font-medium leading-none">Image URL</div>
						<div className="min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono break-all">
							{tool.imageUrl.startsWith("data:image/")
								? "Base64 encoded image"
								: tool.imageUrl}
						</div>
					</div>
				)}

				{/* Server URL */}
				<div className="space-y-2">
					<div className="text-sm font-medium leading-none">Server URL</div>
					<div className="min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono break-all">
						{tool.config.mcp.server.url}
					</div>
				</div>

				{/* Transport and Credential */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{tool.config.mcp.transport && (
						<div className="space-y-2">
							<div className="text-sm font-medium leading-none">
								Transport Type
							</div>
							<div className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm">
								{tool.config.mcp.transport.type}
							</div>
						</div>
					)}
					<div className="space-y-2">
						<div className="text-sm font-medium leading-none">Credential</div>
						<div className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm items-center">
							{tool.credentialReferenceId ? (
								<div className="flex items-center gap-2">
									<Lock className="w-4 h-4" />
									<Link
										href={`/${tenantId}/projects/${projectId}/credentials/${tool.credentialReferenceId}`}
										className="text-blue-600 hover:text-blue-800 hover:underline"
									>
										Click to view credential
									</Link>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<LockOpen className="w-4 h-4" />
									<span className="text-muted-foreground">Unsecured</span>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Active Tools */}
				<div className="space-y-2">
					<div className="flex gap-2 items-center">
						<div className="text-sm font-medium leading-none">Active Tools</div>
						<Badge
							variant="code"
							className="border-none px-2 text-[10px] text-gray-700"
						>
							{tool.config.mcp.activeTools === undefined
								? (tool.availableTools?.length ?? 0)
								: (tool.config.mcp.activeTools?.length ?? 0)}
						</Badge>
					</div>
					<div className="min-h-10 w-full rounded-md border bg-background px-3 py-2">
						{tool.config.mcp.activeTools === undefined ? (
							// All tools are active (undefined means all)
							tool.availableTools && tool.availableTools.length > 0 ? (
								<div className="flex flex-wrap gap-2">
									{tool.availableTools.map((toolInfo) => (
										<Badge key={toolInfo.name} variant="outline">
											{toolInfo.name}
										</Badge>
									))}
								</div>
							) : (
								<div className="text-sm text-muted-foreground">
									No tools available
								</div>
							)
						) : tool.config.mcp.activeTools &&
							tool.config.mcp.activeTools.length > 0 ? (
							// Specific tools are active
							<div className="flex flex-wrap gap-2">
								{tool.config.mcp.activeTools.map((toolName) => (
									<Badge key={toolName} variant="outline">
										{toolName}
									</Badge>
								))}
							</div>
						) : (
							// No tools are active (empty array)
							<div className="text-sm text-muted-foreground">None</div>
						)}
					</div>
				</div>

				{/* Available Tools */}
				{tool.availableTools && tool.availableTools.length > 0 && (
					<AvailableToolsCard tools={tool.availableTools} />
				)}
			</div>
		</div>
	);
}
