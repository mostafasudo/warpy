<script setup lang="ts">
import { createApp, h, onBeforeUnmount, onMounted, watch } from "vue"
import { mountWidget, type MountedWidget } from "../core/mountWidget"

const props = defineProps<{
  agentId: string
  baseUrl?: string
  scriptSrc: string
  containerId?: string
  components?: unknown[]
}>()

let widget: MountedWidget | null = null

const normalizeComponents = (components?: unknown[]) => {
  if (!Array.isArray(components)) return undefined
  return components.map((entry) => {
    if (!entry || typeof entry !== "object" || !("component" in entry)) return entry
    const componentEntry = entry as { key?: string; version?: string; component?: unknown }
    if (!componentEntry.component) return entry
    return {
      key: componentEntry.key,
      version: componentEntry.version,
      render: ({ mount, props }: { mount: Element; props: Record<string, unknown> }) => {
        const app = createApp({ render: () => h(componentEntry.component as object, props) })
        app.mount(mount)
        return () => app.unmount()
      }
    }
  })
}

const mount = () => {
  widget?.unmount()
  widget = mountWidget({
    agentId: props.agentId,
    baseUrl: props.baseUrl,
    scriptSrc: props.scriptSrc,
    containerId: props.containerId,
    components: normalizeComponents(props.components)
  })
}

onMounted(mount)

watch(
  () => [props.agentId, props.baseUrl, props.scriptSrc, props.containerId, props.components],
  () => mount()
)

onBeforeUnmount(() => {
  widget?.unmount()
  widget = null
})
</script>
