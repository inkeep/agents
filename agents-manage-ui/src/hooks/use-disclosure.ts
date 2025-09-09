"use client";

import { useState } from "react";

export function useDisclosure(initial = false) {
	const [value, setValue] = useState(initial);

	return {
		isOpen: value,
		onClose: () => setValue(false),
		onOpen: () => setValue(true),
		onToggle: () => setValue((prev) => !prev),
		setValue,
	};
}
