package pdf

import (
	"fmt"
	"strconv"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/line"
	"github.com/johnfercher/maroto/v2/pkg/components/row"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"

	"github.com/Lucas-Mol/order-platform-microservice-project/pdf-service/internal/events"
)

const (
	issuer     = "Order Platform"
	dateLayout = "2006-01-02 15:04 UTC"
)

var (
	headerFill = &props.Color{Red: 30, Green: 30, Blue: 30}
	stripeFill = &props.Color{Red: 240, Green: 240, Blue: 240}
	muted      = &props.Color{Red: 100, Green: 100, Blue: 100}
)

func RenderInvoice(order events.OrderCreatedData) ([]byte, error) {
	cfg := config.NewBuilder().
		WithLeftMargin(15).
		WithTopMargin(15).
		WithRightMargin(15).
		WithPageNumber().
		WithTitle("Invoice "+order.OrderID, true).
		WithAuthor(issuer, true).
		WithCreationDate(order.OccurredAt).
		Build()

	m := maroto.New(cfg)
	m.AddRows(header(order)...)
	m.AddRows(items(order.Items)...)
	m.AddRows(total(order.TotalCents)...)

	doc, err := m.Generate()
	if err != nil {
		return nil, fmt.Errorf("generate invoice %s: %w", order.OrderID, err)
	}
	return doc.GetBytes(), nil
}

func header(order events.OrderCreatedData) []core.Row {
	label := props.Text{Size: 9, Color: muted}
	value := props.Text{Size: 9, Style: fontstyle.Bold}
	return []core.Row{
		row.New(12).Add(
			text.NewCol(6, issuer, props.Text{Size: 16, Style: fontstyle.Bold}),
			text.NewCol(6, "INVOICE", props.Text{Size: 16, Style: fontstyle.Bold, Align: align.Right}),
		),
		row.New(5).Add(text.NewCol(3, "Order", label), text.NewCol(9, order.OrderID, value)),
		row.New(5).Add(text.NewCol(3, "Issued", label), text.NewCol(9, order.OccurredAt.Format(dateLayout), value)),
		row.New(5).Add(text.NewCol(3, "Billed to", label), text.NewCol(9, order.UserEmail, value)),
		row.New(8),
	}
}

func items(items []events.OrderItem) []core.Row {
	head := props.Text{Size: 9, Style: fontstyle.Bold, Color: &props.WhiteColor, Top: 1.5, Left: 2, Right: 2}
	headRight := head
	headRight.Align = align.Right

	rows := []core.Row{
		row.New(7).Add(
			text.NewCol(6, "Product", head),
			text.NewCol(2, "Qty", headRight),
			text.NewCol(2, "Unit price", headRight),
			text.NewCol(2, "Amount", headRight),
		).WithStyle(&props.Cell{BackgroundColor: headerFill}),
	}

	cell := props.Text{Size: 9, Top: 1.5, Bottom: 1.5, Left: 2, Right: 2}
	cellRight := cell
	cellRight.Align = align.Right
	for i, item := range items {
		r := row.New().Add(
			text.NewCol(6, item.Name, cell),
			text.NewCol(2, strconv.Itoa(item.Quantity), cellRight),
			text.NewCol(2, FormatCents(item.UnitPriceCents), cellRight),
			text.NewCol(2, FormatCents(int64(item.Quantity)*item.UnitPriceCents), cellRight),
		)
		if i%2 == 1 {
			r.WithStyle(&props.Cell{BackgroundColor: stripeFill})
		}
		rows = append(rows, r)
	}
	return rows
}

func total(cents int64) []core.Row {
	return []core.Row{
		row.New(6).Add(line.NewCol(12, props.Line{Thickness: 0.4, SizePercent: 100, OffsetPercent: 50})),
		row.New(8).Add(
			text.NewCol(8, "Total", props.Text{Size: 11, Style: fontstyle.Bold, Align: align.Right, Right: 2}),
			text.NewCol(4, FormatCents(cents), props.Text{Size: 11, Style: fontstyle.Bold, Align: align.Right, Right: 2}),
		),
	}
}

func FormatCents(cents int64) string {
	sign := ""
	if cents < 0 {
		sign = "-"
		cents = -cents
	}
	whole := strconv.FormatInt(cents/100, 10)
	for i := len(whole) - 3; i > 0; i -= 3 {
		whole = whole[:i] + "," + whole[i:]
	}
	return fmt.Sprintf("%s$%s.%02d", sign, whole, cents%100)
}
