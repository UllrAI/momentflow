"""Reproduce illustrative market scenarios; these are not forecasts."""

from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP


def money(value: Decimal) -> str:
    return f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,}"


def main() -> None:
    # Sources and limitations are recorded in the adjacent research report.
    populations = {
        "2025 full/half marathon participant-visits": Decimal("4540900"),
        "2024-2025 ski-season visits": Decimal("26050000"),
    }
    hypothetical_price = Decimal("59")
    hypothetical_platform_share = Decimal("0.20")

    print("Illustrative scenarios only. Prices, payment rates and fees are assumptions.")
    print("Final payment rate includes coverage, successful capture, reach and purchase.")
    print("These population proxies are not validated SAM or obtainable market share.\n")
    print("| Population proxy | Final payment rate | Hypothetical GMV (CNY) | Platform revenue (CNY) |")
    print("|---|---:|---:|---:|")
    for name, count in populations.items():
        for rate in (Decimal("0.02"), Decimal("0.05"), Decimal("0.10")):
            gmv = count * rate * hypothetical_price
            revenue = gmv * hypothetical_platform_share
            print(f"| {name} | {rate:.0%} | {money(gmv)} | {money(revenue)} |")

    annual_revenues = {
        "Experience operator": (
            Decimal("50000")
            * Decimal("0.90")
            * Decimal("0.60")
            * Decimal("0.10")
            * hypothetical_price
            * hypothetical_platform_share
        ),
        "Camp operator": Decimal("20") * Decimal("50") * Decimal("15"),
        "Kindergarten": Decimal("10000"),
        "Event software customer": Decimal("799"),
    }
    target = Decimal("10000000")
    print("\nHypothetical customer footprint for CNY 10 million annual platform revenue:")
    for name, revenue in annual_revenues.items():
        customers = (target / revenue).to_integral_value(rounding=ROUND_CEILING)
        print(f"{name}: {money(revenue)} CNY/customer/year; {customers} paying customers")

    non_inclusive_children = (Decimal("3225.52") - Decimal("2951.07")) * Decimal("10000")
    print(f"\nStatistical non-inclusive preschool difference: {non_inclusive_children:,.0f}")
    print("This difference does not identify premium customers or obtainable demand.")


if __name__ == "__main__":
    main()
