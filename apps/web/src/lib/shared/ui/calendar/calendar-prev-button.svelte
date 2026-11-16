<script lang="ts">
	import { Calendar as CalendarPrimitive } from "bits-ui";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import { buttonVariants, type ButtonVariant } from "$lib/shared/ui/button/index.js";
	import { cn } from "$lib/shared/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		variant = "ghost",
		...restProps
	}: CalendarPrimitive.PrevButtonProps & {
		variant?: ButtonVariant;
	} = $props();
</script>

{#snippet Fallback()}
	<ChevronLeftIcon
		class={cn("size-4", className)}
	/>
{/snippet}

<CalendarPrimitive.PrevButton
	bind:ref
	class={cn(
		buttonVariants({ variant }),
		"size-(--cell-size) bg-transparent p-0 select-none disabled:opacity-50",
		// parity-ignore: keep rtl utilities until the CLI rewrites them
		"rtl:rotate-180",
		className
	)}
	{...restProps}
>
	{#snippet child({ props })}
		<button {...props} aria-label={restProps["aria-label"] ?? "Bulan sebelumnya"}>
			{#if children}
				{@render children?.()}
			{:else}
				{@render Fallback()}
			{/if}
		</button>
	{/snippet}
</CalendarPrimitive.PrevButton>
