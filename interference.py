"""Simulate and visualize the double-slit interference pattern."""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np


def double_slit_intensity(
    x: np.ndarray,
    y: np.ndarray,
    *,
    wavelength: float = 532e-9,
    slit_spacing: float = 0.30e-3,
    slit_width: float = 0.06e-3,
    screen_distance: float = 1.50,
    beam_radius: float = 7.0e-3,
) -> np.ndarray:
    """Return the normalized interference intensity on the screen.

    Coordinates and physical dimensions are expressed in metres.
    """
    # Use the exact sine of the observation angle to include off-axis effects.
    sin_theta = x / np.hypot(x, screen_distance)

    # Two-slit interference term.
    interference = 4.0 * np.cos(
        np.pi * slit_spacing * sin_theta / wavelength
    ) ** 2

    # Finite slit width produces the broader single-slit diffraction envelope.
    diffraction = np.sinc(slit_width * sin_theta / wavelength) ** 2

    # A Gaussian beam makes the fringes fade smoothly toward the screen edge.
    beam_envelope = np.exp(-2.0 * (x**2 + y**2) / beam_radius**2)

    intensity = interference * diffraction * beam_envelope
    return intensity / intensity.max()


def main() -> None:
    wavelength = 532e-9  # Green laser, in metres.
    slit_spacing = 0.30e-3
    screen_distance = 1.50

    # Screen coordinates in metres. These ranges display roughly 13 fringes.
    screen_x = np.linspace(-18e-3, 18e-3, 1600)
    screen_y = np.linspace(-10e-3, 10e-3, 800)
    x, y = np.meshgrid(screen_x, screen_y)

    intensity = double_slit_intensity(
        x,
        y,
        wavelength=wavelength,
        slit_spacing=slit_spacing,
        screen_distance=screen_distance,
    )

    fig, ax = plt.subplots(figsize=(10, 5.6), facecolor="#090b10")
    image = ax.imshow(
        intensity,
        extent=(
            screen_x.min() * 1e3,
            screen_x.max() * 1e3,
            screen_y.min() * 1e3,
            screen_y.max() * 1e3,
        ),
        origin="lower",
        cmap="turbo",
        vmin=0.0,
        vmax=1.0,
        interpolation="bilinear",
        aspect="auto",
    )

    fringe_spacing_mm = wavelength * screen_distance / slit_spacing * 1e3
    ax.set_title(
        "Double-Slit Interference  "
        f"($\\lambda$ = {wavelength * 1e9:.0f} nm, "
        f"$\\Delta x$ ≈ {fringe_spacing_mm:.2f} mm)",
        color="white",
        fontsize=15,
        pad=14,
    )
    ax.set_xlabel("Horizontal screen position $x$ (mm)", color="white")
    ax.set_ylabel("Vertical screen position $y$ (mm)", color="white")
    ax.tick_params(colors="white")
    for spine in ax.spines.values():
        spine.set_color("#aab4c3")

    colorbar = fig.colorbar(image, ax=ax, pad=0.02)
    colorbar.set_label("Normalized intensity", color="white")
    colorbar.ax.tick_params(colors="white")
    colorbar.outline.set_edgecolor("#aab4c3")

    fig.tight_layout()
    output_path = Path(__file__).with_name("double_slit_interference.png")
    fig.savefig(output_path, dpi=180, facecolor=fig.get_facecolor())
    print(f"Saved: {output_path}")
    plt.show()


if __name__ == "__main__":
    main()
