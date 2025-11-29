import { describe, expect, it } from "@jest/globals"

import { configSelectors, useConfigUiStore } from "./config-ui"

describe("config-ui store", () => {
  it("updates base form and resets", () => {
    useConfigUiStore.getState().setBaseForm({ envName: "dev", url: "http://dev" })
    expect(configSelectors.baseForm(useConfigUiStore.getState()).envName).toBe("dev")
    useConfigUiStore.getState().resetBaseForm()
    expect(configSelectors.baseForm(useConfigUiStore.getState()).envName).toBe("")
  })

  it("manages dialog and submitting flags", () => {
    configSelectors.setBaseDialogOpen(useConfigUiStore.getState())(true)
    configSelectors.setBaseSubmitting(useConfigUiStore.getState())(true)
    expect(configSelectors.baseDialogOpen(useConfigUiStore.getState())).toBe(true)
    expect(configSelectors.baseSubmitting(useConfigUiStore.getState())).toBe(true)
    configSelectors.setHeaderDialogOpen(useConfigUiStore.getState())(true)
    configSelectors.setHeaderSubmitting(useConfigUiStore.getState())(true)
    expect(configSelectors.headerDialogOpen(useConfigUiStore.getState())).toBe(true)
    expect(configSelectors.headerSubmitting(useConfigUiStore.getState())).toBe(true)
  })
})
