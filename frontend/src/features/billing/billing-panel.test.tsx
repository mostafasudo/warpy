import { beforeEach, describe, expect, it, jest } from "@jest/globals"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import "@testing-library/jest-dom"
import { useCreateSubscriptionCheckout } from "@/mutations/use-create-subscription-checkout"
import { useCreateTopupCheckout } from "@/mutations/use-create-topup-checkout"
import { useOpenBillingPortal } from "@/mutations/use-open-billing-portal"
import { useBillingSummaryQuery } from "@/queries/use-billing-summary"
import { useNavigationStore } from "@/stores/navigation"
import { useToastStore } from "@/stores/toast"
import * as billingNavigationModule from "./billing-navigation"
import { BillingPanel } from "./billing-panel"

jest.mock("@/queries/use-billing-summary", () => ({
  useBillingSummaryQuery: jest.fn()
}))

jest.mock("@/mutations/use-create-subscription-checkout", () => ({
  useCreateSubscriptionCheckout: jest.fn()
}))

jest.mock("@/mutations/use-create-topup-checkout", () => ({
  useCreateTopupCheckout: jest.fn()
}))

jest.mock("@/mutations/use-open-billing-portal", () => ({
  useOpenBillingPortal: jest.fn()
}))

const mockedUseBillingSummaryQuery = useBillingSummaryQuery as jest.Mock
const mockedUseCreateSubscriptionCheckout = useCreateSubscriptionCheckout as jest.Mock
const mockedUseCreateTopupCheckout = useCreateTopupCheckout as jest.Mock
const mockedUseOpenBillingPortal = useOpenBillingPortal as jest.Mock

describe("BillingPanel", () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    useToastStore.setState({ toasts: [] })
    useNavigationStore.setState({ section: "billing", sidebarCollapsed: false })
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: {
        plan: "basic",
        actionsRemaining: 1234,
        monthlyActionsRemaining: 1200,
        monthlyActionQuota: 15000,
        topupActionsRemaining: 0,
        lifetimeActionsRemaining: 0,
        isWidgetHidden: false,
        canManageSubscription: true,
        subscriptionStatus: "active",
        subscriptionRenewsAt: null
      },
      isPending: false
    })
  })

  it("renders plan and remaining actions", async () => {
    mockedUseCreateSubscriptionCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseCreateTopupCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })

    render(<BillingPanel />)

    expect(await screen.findByText("Billing")).not.toBeNull()
    expect(screen.getAllByText("Basic").length).toBeGreaterThan(0)
    expect(screen.getByText("1,234")).not.toBeNull()
  })

  it("starts subscription checkout", async () => {
    const mutateAsync = jest.fn(async (...args: Array<unknown>) => {
      void args
      return { url: "https://checkout.test/basic" }
    })
    mockedUseCreateSubscriptionCheckout.mockReturnValue({ mutateAsync, isPending: false })
    mockedUseCreateTopupCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })

    const navigateSpy = jest.spyOn(billingNavigationModule, "navigateToUrl").mockImplementation(() => {})

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<BillingPanel />)

    await user.click(await screen.findByRole("button", { name: "Choose Pro" }))
    expect(mutateAsync).toHaveBeenCalledWith("pro")
    expect(navigateSpy).toHaveBeenCalledWith("https://checkout.test/basic")
  })

  it("starts top-up checkout and opens portal", async () => {
    const topupMutate = jest.fn(async (...args: Array<unknown>) => {
      void args
      return { url: "https://checkout.test/topup" }
    })
    const portalMutate = jest.fn(async () => ({ url: "https://portal.test" }))
    mockedUseCreateSubscriptionCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseCreateTopupCheckout.mockReturnValue({ mutateAsync: topupMutate, isPending: false })
    mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync: portalMutate, isPending: false })

    const navigateSpy = jest.spyOn(billingNavigationModule, "navigateToUrl").mockImplementation(() => {})
    const openSpy = jest.spyOn(billingNavigationModule, "openInNewTab").mockImplementation(() => null)

    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<BillingPanel />)

    await user.click(await screen.findByRole("button", { name: "Buy 1,000 actions ($50)" }))
    expect(topupMutate).toHaveBeenCalledWith("1000")
    expect(navigateSpy).toHaveBeenCalledWith("https://checkout.test/topup")

    await user.click(await screen.findByRole("button", { name: "Manage subscription" }))
    expect(portalMutate).toHaveBeenCalled()
    expect(openSpy).toHaveBeenCalledWith("https://portal.test")
  })

  it("hides portal button when no subscription", async () => {
    mockedUseBillingSummaryQuery.mockReturnValue({
      data: {
        plan: "free",
        actionsRemaining: 0,
        monthlyActionsRemaining: 0,
        monthlyActionQuota: 0,
        topupActionsRemaining: 0,
        lifetimeActionsRemaining: 0,
        isWidgetHidden: true,
        canManageSubscription: false,
        subscriptionStatus: null,
        subscriptionRenewsAt: null
      },
      isPending: false
    })
    mockedUseCreateSubscriptionCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseCreateTopupCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })

    render(<BillingPanel />)
    expect(await screen.findByText("Billing")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Manage subscription" })).toBeNull()
  })

  it("routes contact sales to the contact tab", async () => {
    mockedUseCreateSubscriptionCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseCreateTopupCheckout.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    mockedUseOpenBillingPortal.mockReturnValue({ mutateAsync: jest.fn(), isPending: false })
    const user = userEvent.setup({ pointerEventsCheck: 0 })

    render(<BillingPanel />)

    await user.click(await screen.findByRole("button", { name: "Contact sales" }))
    expect(useNavigationStore.getState().section).toBe("contact")
  })
})
