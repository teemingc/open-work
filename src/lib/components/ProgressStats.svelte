<script lang="ts">
	import type { MonthlyInvoice } from '../invoice.svelte';
	import {
		calculateTotalHours,
		calculateProgress,
		calculateDailyPace,
		getProgressStatus,
		compareToLastMonth,
		getDaysInMonth,
		getCurrentDay,
		calculateTotalAmount,
		formatCurrency
	} from '../../routes/invoices/[invoiceId]/formatter';
	import {
		BarChart3,
		Clock,
		DollarSign,
		TrendingUp,
		Calendar,
		Zap,
		Rocket,
		CheckCircle2,
		AlertTriangle,
		CircleDot,
		Activity
	} from 'lucide-svelte';

	let {
		invoice,
		settings,
		previousInvoice = undefined
	}: {
		invoice: MonthlyInvoice;
		settings: { hourlyRate?: number; defaultCurrency?: string; monthlyHourGoal?: number };
		previousInvoice?: MonthlyInvoice;
	} = $props();

	const totalHours = $derived(calculateTotalHours(invoice));
	const githubHours = $derived(
		invoice.githubContributions.reduce((sum, c) => sum + (c.hours || 0), 0)
	);
	const manualHours = $derived(invoice.manualItems.reduce((sum, i) => sum + i.hours, 0));

	const totalAmount = $derived(
		settings.hourlyRate ? calculateTotalAmount(totalHours, settings.hourlyRate) : undefined
	);

	const hoursProgress = $derived(calculateProgress(totalHours, settings.monthlyHourGoal));

	const daysInMonth = $derived(getDaysInMonth(invoice.year, invoice.month));
	const currentDay = $derived(getCurrentDay());
	const daysRemaining = $derived(Math.max(0, daysInMonth - currentDay));

	const dailyPace = $derived(
		settings.monthlyHourGoal
			? calculateDailyPace(totalHours, settings.monthlyHourGoal, daysInMonth, currentDay)
			: 0
	);

	const status = $derived(
		getProgressStatus(totalHours, settings.monthlyHourGoal, currentDay, daysInMonth)
	);

	const comparison = $derived(compareToLastMonth(invoice, previousInvoice));

	const statusConfig: Record<
		'ahead' | 'on-track' | 'behind' | 'way-behind' | 'no-goal',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dunno what the icon type is
		{ label: string; icon: any; color: string }
	> = {
		ahead: { label: 'Ahead of pace', icon: Rocket, color: 'text-green-600' },
		'on-track': { label: 'On track', icon: CheckCircle2, color: 'text-green-600' },
		behind: { label: 'Slightly behind pace', icon: AlertTriangle, color: 'text-yellow-600' },
		'way-behind': { label: 'Behind pace', icon: CircleDot, color: 'text-red-600' },
		'no-goal': { label: 'No goal set', icon: Activity, color: 'text-gray-600' }
	};
</script>

<div class="space-y-4 rounded-lg border bg-white p-6">
	<h3 class="flex items-center gap-2 text-lg font-semibold">
		<BarChart3 size={20} />
		{new Date(invoice.year, invoice.month - 1).toLocaleDateString('en-US', {
			month: 'long',
			year: 'numeric'
		})} Progress
	</h3>

	<!-- Hours Progress -->
	<div class="space-y-2">
		<div class="flex items-center justify-between text-sm">
			<span class="flex items-center gap-1.5 font-medium"><Clock size={16} />Hours</span>
			<span class="text-gray-600">
				{totalHours}
				{#if settings.monthlyHourGoal}
					/ {settings.monthlyHourGoal} ({hoursProgress}%)
				{/if}
			</span>
		</div>
		<div class="h-3 w-full overflow-hidden rounded-full bg-gray-200">
			<div
				class="h-full bg-blue-600 transition-all duration-300"
				style="width: {Math.min(100, hoursProgress)}%"
			></div>
		</div>
		<div class="text-xs text-gray-500">
			GitHub: {githubHours}h | Manual: {manualHours}h
		</div>
	</div>

	<!-- Amount Progress (if hourly rate set) -->
	{#if totalAmount !== undefined && settings.monthlyHourGoal}
		<div class="space-y-2">
			<div class="flex items-center justify-between text-sm">
				<span class="flex items-center gap-1.5 font-medium"><DollarSign size={16} />Amount</span>
				<span class="text-gray-600">
					{formatCurrency(totalAmount, settings.defaultCurrency)}
				</span>
			</div>
		</div>
	{/if}

	<!-- Comparison to last month -->
	{#if previousInvoice}
		<div class="flex items-center gap-1.5 text-sm text-gray-600">
			<TrendingUp size={16} />
			vs {new Date(previousInvoice.year, previousInvoice.month - 1).toLocaleDateString('en-US', {
				month: 'long'
			})}:
			{#if comparison.hoursDiff > 0}
				<span class="text-green-600"
					>+{comparison.hoursDiff} hours (+{Math.round(comparison.percentChange)}%)</span
				>
			{:else if comparison.hoursDiff < 0}
				<span class="text-red-600"
					>{comparison.hoursDiff} hours ({Math.round(comparison.percentChange)}%)</span
				>
			{:else}
				<span>No change</span>
			{/if}
		</div>
	{/if}

	<!-- Days remaining and pace -->
	{#if settings.monthlyHourGoal && status !== 'no-goal'}
		<div class="space-y-1 text-sm">
			<div class="flex items-center gap-1.5 text-gray-600">
				<Calendar size={16} />Days remaining: {daysRemaining}
			</div>
			{#if dailyPace > 0}
				<div class="flex items-center gap-1.5 text-gray-600">
					<Zap size={16} />Need ~{dailyPace.toFixed(1)} hours/day to reach goal
				</div>
			{/if}
		</div>
	{/if}

	<!-- Status -->
	<div class="border-t pt-2">
		{#snippet statusIcon()}
			{@const StatusIcon = statusConfig[status].icon}
			<span class="flex items-center gap-1.5 {statusConfig[status].color}">
				<StatusIcon size={16} />
				{statusConfig[status].label}
			</span>
		{/snippet}
		<div class="flex items-center gap-2 text-sm">
			<span class="font-medium">Status:</span>
			{@render statusIcon()}
		</div>
	</div>
</div>
