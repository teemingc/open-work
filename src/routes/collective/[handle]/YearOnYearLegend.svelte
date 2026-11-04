<!--
	Under a chart shaded between a line and the same line a year earlier, so the shading's colours
	explain themselves without a caption.
-->
<ul class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
	<li class="flex items-center gap-1.5">
		<span class="w-4 border-t border-dashed border-muted-foreground" aria-hidden="true"></span>
		A year earlier
	</li>
	<li class="flex items-center gap-1.5">
		<span
			class="size-3 rounded-sm bg-[color-mix(in_oklab,var(--color-status-paid)_22%,transparent)]"
			aria-hidden="true"
		></span>
		Higher than a year earlier
	</li>
	<li class="flex items-center gap-1.5">
		<span
			class="size-3 rounded-sm bg-[color-mix(in_oklab,var(--color-destructive)_22%,transparent)]"
			aria-hidden="true"
		></span>
		Lower than a year earlier
	</li>
</ul>
