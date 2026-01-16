import { fireEvent, render, screen } from "@testing-library/react"

import { widgetStylesDefault } from "@/types/widget-styles"
import { ColorsEditor } from "./widget-style-editors"

describe("Widget style editors", () => {
  it("updates colors when inputs change", () => {
    const onChange = jest.fn()
    render(<ColorsEditor styles={widgetStylesDefault} onChange={onChange} />)

    const textInputs = screen.getAllByRole("textbox")
    fireEvent.change(textInputs[0], { target: { value: "#123456" } })

    expect(onChange).toHaveBeenCalled()
  })

})
