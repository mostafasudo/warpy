<script>
  import { onDestroy, onMount } from "svelte"
  import { mountWidget } from "../core/mountWidget.js"

  export let agentId
  export let baseUrl
  export let scriptSrc
  export let containerId
  export let components

  let widget = null
  let mounted = false

  const normalizeComponents = (entries) => {
    if (!Array.isArray(entries)) return undefined
    return entries.map((entry) => {
      if (!entry || !entry.component) return entry
      return {
        key: entry.key,
        version: entry.version,
        render: ({ mount, props }) => {
          const instance = new entry.component({ target: mount, props })
          return () => instance.$destroy?.()
        }
      }
    })
  }

  const unmount = () => {
    if (widget) {
      widget.unmount()
      widget = null
    }
  }

  onMount(() => {
    mounted = true
  })

  $: if (mounted) {
    unmount()
    if (agentId && scriptSrc) {
      widget = mountWidget({ agentId, baseUrl, scriptSrc, containerId, components: normalizeComponents(components) })
    }
  }

  onDestroy(() => {
    unmount()
  })
</script>
