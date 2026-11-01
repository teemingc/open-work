<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import type { Address } from '#lib/worklog.js';

	let {
		id,
		address,
		onchange
	}: {
		/** Prefixes each field's id. */
		id: string;
		address: Address | undefined;
		onchange: (address: Address) => void;
	} = $props();

	const current = $derived(
		address ?? { street: '', extra: '', city: '', postcode: '', region: '', country: '' }
	);

	function change(patch: Partial<Address>) {
		onchange({ ...$state.snapshot(current), ...patch });
	}

	const countryName = $derived.by(() => {
		if (!/^[A-Z]{2}$/.test(current.country)) return undefined;
		try {
			return new Intl.DisplayNames(['en'], { type: 'region' }).of(current.country);
		} catch {
			return undefined;
		}
	});
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_5rem]">
	<div class="col-span-2 space-y-1.5 sm:col-span-4">
		<Label for="{id}-street">Street</Label>
		<Input
			id="{id}-street"
			autocomplete="off"
			value={current.street}
			onchange={(event) => change({ street: event.currentTarget.value.trim() })}
		/>
	</div>
	<div class="col-span-2 space-y-1.5 sm:col-span-4">
		<Label for="{id}-extra"
			>Address line 2 <span class="text-muted-foreground">(optional)</span></Label
		>
		<Input
			id="{id}-extra"
			autocomplete="off"
			value={current.extra}
			onchange={(event) => change({ extra: event.currentTarget.value.trim() })}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-postcode">Postcode</Label>
		<Input
			id="{id}-postcode"
			autocomplete="off"
			value={current.postcode}
			onchange={(event) => change({ postcode: event.currentTarget.value.trim() })}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-city">City</Label>
		<Input
			id="{id}-city"
			autocomplete="off"
			value={current.city}
			onchange={(event) => change({ city: event.currentTarget.value.trim() })}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-region">State</Label>
		<Input
			id="{id}-region"
			autocomplete="off"
			value={current.region}
			onchange={(event) => change({ region: event.currentTarget.value.trim() })}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="{id}-country">Country</Label>
		<Input
			id="{id}-country"
			autocomplete="off"
			maxlength={2}
			placeholder="MY"
			class="uppercase"
			aria-describedby="{id}-country-name"
			value={current.country}
			onchange={(event) => change({ country: event.currentTarget.value.trim().toUpperCase() })}
		/>
	</div>
	<p id="{id}-country-name" class="col-span-2 -mt-1 text-xs text-muted-foreground sm:col-span-4">
		{countryName ??
			'Country as a two-letter code, like MY for Malaysia or US for the United States.'}
	</p>
</div>
