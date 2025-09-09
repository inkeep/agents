/**
 * Formats an ISO date string as "Mon DD, YYYY", e.g. "Jan 20, 2024".
 * @param {string} isoString - An ISO‐formatted date string, e.g. "2024-01-20T14:45:00Z"
 * @returns {string} - Formatted date like "Jan 20, 2024"
 */
export function formatDate(isoString: string) {
	const date = new Date(isoString);

	// Check if the date is valid first
	if (Number.isNaN(date.getTime())) {
		return "Invalid date";
	}

	try {
		const formatter = new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
		return formatter.format(date);
	} catch (error) {
		console.error("Error formatting date:", error);
		return "Invalid date";
	}
}

export function formatDateTime(isoString: string): string {
	const date = new Date(isoString);
	if (Number.isNaN(date.getTime())) return "Invalid date";
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	}).format(date); // e.g. "Aug 28, 2024, 5:42:30 PM"
}

export function formatDateAgo(dateString: string) {
	try {
		const date = new Date(dateString);

		// Check if the date is valid
		if (Number.isNaN(date.getTime())) {
			return "Invalid date";
		}

		const now = new Date();
		const diffInMs = now.getTime() - date.getTime();

		// Handle future dates
		if (diffInMs < 0) {
			return "In the future";
		}

		const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
		const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
		const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

		if (diffInMinutes < 1) {
			return "just now";
		} else if (diffInMinutes < 60) {
			return `${diffInMinutes}m ago`;
		} else if (diffInHours < 24) {
			return `${diffInHours}h ago`;
		} else if (diffInDays < 7) {
			return `${diffInDays}d ago`;
		} else if (diffInDays < 30) {
			const weeks = Math.floor(diffInDays / 7);
			return `${weeks}w ago`;
		} else {
			return date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
			});
		}
	} catch (error) {
		console.warn("Error formatting date:", dateString, error);
		return "Invalid date";
	}
}

export function formatDuration(durationMs: number): string {
	const totalMinutes = Math.round(durationMs / 1000 / 60);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}
