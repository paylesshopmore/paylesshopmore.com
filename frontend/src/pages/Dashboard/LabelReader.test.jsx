// "Label scannen" on the intake sheet: read a label, tap its lines, tap the
// field they go in.

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureJpeg } from '../../measurement/cameraService';
import { readLabel, toLines } from '../../ocr/readLabel';
import { readLabelWithAi } from '../../api/staff';
import LabelReader from './LabelReader';
import { renderWithProviders } from '../../test/utils';

// jsdom has no camera and no Tesseract: a camera that is simply "live", and
// a label that reads as these lines.
vi.mock('../Warehouse/camera/useCamera', () => ({
  useCamera: () => ({
    videoRef: { current: null },
    status: 'live',
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock('../../measurement/cameraService', () => ({ captureJpeg: vi.fn() }));
vi.mock('../../ocr/readLabel', async (importOriginal) => ({
  ...(await importOriginal()),
  readLabel: vi.fn(),
}));

vi.mock('../../api/staff', async (importOriginal) => ({
  ...(await importOriginal()),
  readLabelWithAi: vi.fn(),
}));

const LINES = ['Bol.com BV', 'Jan de Vries', 'Kaya Grandi 12', 'Willemstad'];

beforeEach(() => {
  // The intake sheet is written in Dutch; these tests read it that way.
  window.localStorage.setItem('plsm.language', 'nl');
  vi.clearAllMocks();
  captureJpeg.mockResolvedValue(new File(['x'], 'foto.jpg', { type: 'image/jpeg' }));
  readLabel.mockResolvedValue(LINES);
});

async function scan(user) {
  await user.click(screen.getByRole('button', { name: 'Label scannen' }));
  await user.click(screen.getByRole('button', { name: 'Lees label' }));
}

describe('the label reader', () => {
  it('reads a label with the camera and shows its lines', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LabelReader onPick={vi.fn()} />);

    await scan(user);

    for (const line of LINES) expect(screen.getByRole('button', { name: line })).toBeInTheDocument();
    // The camera closed once the label was read.
    expect(screen.queryByRole('button', { name: 'Lees label' })).toBeNull();
  });

  it('puts one tapped line into the chosen field', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<LabelReader onPick={onPick} />);
    await scan(user);

    await user.click(screen.getByRole('button', { name: 'Bol.com BV' }));
    await user.click(screen.getByRole('button', { name: 'Afzender' }));

    expect(onPick).toHaveBeenCalledWith('sender', 'Bol.com BV');
    expect(screen.getByText('Ingevuld bij Afzender.')).toBeInTheDocument();
  });

  it('joins several lines, in the order they were tapped', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<LabelReader onPick={onPick} />);
    await scan(user);

    await user.click(screen.getByRole('button', { name: 'Jan de Vries' }));
    await user.click(screen.getByRole('button', { name: /Kaya Grandi 12/ }));
    await user.click(screen.getByRole('button', { name: 'Ontvanger' }));

    expect(onPick).toHaveBeenCalledWith('recipient', 'Jan de Vries, Kaya Grandi 12');
  });

  it('says so when a label has no readable text', async () => {
    const user = userEvent.setup();
    readLabel.mockResolvedValue([]);
    renderWithProviders(<LabelReader onPick={vi.fn()} />);

    await scan(user);

    expect(screen.getByText(/Geen tekst gevonden/)).toBeInTheDocument();
  });

  it('is not there on a released sheet', () => {
    const { container } = renderWithProviders(<LabelReader onPick={vi.fn()} disabled />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('measurements and shipment details on a label', () => {
  const FEDEX = ['C MELODIE', 'SHIP DATE: 03NOV26 ACTWGT: 13.40 KG', 'DIMS: 60x40x20 CM', 'TRK#', '8796 3229 7750'];

  function renderFull(props = {}) {
    const handlers = {
      onPick: vi.fn(() => true),
      onMeasure: vi.fn(() => true),
      onDetail: vi.fn(() => true),
      onUnassign: vi.fn(),
      onScanned: vi.fn(),
      ...props,
    };
    renderWithProviders(<LabelReader {...handlers} />);
    return handlers;
  }

  beforeEach(() => readLabel.mockResolvedValue(FEDEX));

  it('keeps the label as read, splits it into chips and fills in what has a caption', async () => {
    const user = userEvent.setup();
    const handlers = renderFull();
    await scan(user);

    expect(handlers.onScanned).toHaveBeenCalledWith({ lines: FEDEX, source: 'device' });
    // The line with two captions became two chips.
    expect(screen.getByRole('button', { name: 'SHIP DATE: 03NOV26' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ACTWGT: 13.40 KG' })).toBeInTheDocument();

    expect(handlers.onMeasure).toHaveBeenCalledWith({ weight_kg: '13.4', weight_unit: 'kg' }, { auto: true });
    expect(handlers.onMeasure).toHaveBeenCalledWith(
      { length_cm: '60', width_cm: '40', height_cm: '20', dimension_unit: 'cm' },
      { auto: true },
    );
    expect(handlers.onDetail).toHaveBeenCalledWith('ship_date', '03NOV26', { auto: true });
    // The name is never filled in by itself.
    expect(handlers.onPick).not.toHaveBeenCalled();
    // C MELODIE, TRK# and the number are still waiting.
    expect(screen.getByText('Nog niet toegewezen: 3 van 6')).toBeInTheDocument();
  });

  it('joins a caption and its number into Shipment details', async () => {
    const user = userEvent.setup();
    const handlers = renderFull();
    await scan(user);

    await user.click(screen.getByRole('button', { name: 'TRK#' }));
    await user.click(screen.getByRole('button', { name: /8796 3229 7750/ }));
    await user.click(screen.getByRole('button', { name: 'Zendinggegevens' }));

    expect(handlers.onDetail).toHaveBeenCalledWith('tracking_number', '8796 3229 7750', { auto: false });
  });

  it('asks which weight when a weight has no caption', async () => {
    readLabel.mockResolvedValue(['13400 G']);
    const user = userEvent.setup();
    const handlers = renderFull();
    await scan(user);

    await user.click(screen.getByRole('button', { name: '13400 G' }));
    await user.click(screen.getByRole('button', { name: 'Meting' }));
    await user.click(screen.getByRole('button', { name: 'Volumegewicht' }));

    expect(handlers.onMeasure).toHaveBeenCalledWith(
      { volumetric_weight_kg: '13.4', weight_unit: 'g' },
      { auto: false },
    );
  });

  it('removes an assignment again', async () => {
    const user = userEvent.setup();
    const handlers = renderFull();
    await scan(user);

    await user.click(screen.getByRole('button', { name: '"ACTWGT: 13.40 KG" verwijderen uit Werkelijk gewicht' }));

    expect(handlers.onUnassign).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'measure', target: 'actualWeight' }),
    );
    expect(screen.getByText('Nog niet toegewezen: 4 van 6')).toBeInTheDocument();
  });

  it('asks before a chip already used goes somewhere else too', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    const handlers = renderFull();
    await scan(user);

    await user.click(screen.getByRole('button', { name: 'C MELODIE' }));
    await user.click(screen.getByRole('button', { name: 'Afzender' }));
    await user.click(screen.getByRole('button', { name: 'C MELODIE' }));
    await user.click(screen.getByRole('button', { name: 'Ontvanger' }));

    expect(confirm).toHaveBeenCalled();
    expect(handlers.onPick).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});

describe('tidying what was read', () => {
  it('squeezes spaces and drops empty lines and box-edge noise', () => {
    expect(toLines('  Jan   de Vries \n\n | \nKaya Grandi 12\n—\n')).toEqual([
      'Jan de Vries',
      'Kaya Grandi 12',
    ]);
  });
});

describe('the label reader with AI', () => {
  const AI = {
    fields: { supplier: 'Bol.com BV', sender: '', recipient: 'Jan de Vries, Kaya Grandi 12', destination: '' },
    tracking_number: '3SABC1234567',
    lines: LINES,
    match: { kind: 'courier', customer: 'Jan de Vries', shop_name: 'bol.com', order_description: 'Moederbord' },
  };

  it('fills in the boxes, says which, and shows whose parcel it is', async () => {
    readLabelWithAi.mockResolvedValue(AI);
    const onAiFill = vi.fn(() => ['supplier', 'recipient', 'notes']);
    const user = userEvent.setup();
    renderWithProviders(<LabelReader onPick={vi.fn()} onAiFill={onAiFill} />);

    await scan(user);

    expect(onAiFill).toHaveBeenCalledWith(AI);
    expect(await screen.findByText(/Ingevuld door AI: Leverancier, Ontvanger, Opmerkingen/)).toBeInTheDocument();
    expect(screen.getByText('Vooraangemeld · Jan de Vries · bol.com · Moederbord')).toBeInTheDocument();
    // The lines are still there to tap, and the device reader was not needed.
    expect(screen.getByRole('button', { name: 'Willemstad' })).toBeInTheDocument();
    expect(readLabel).not.toHaveBeenCalled();
  });

  it('reads on the device when the AI is not available', async () => {
    readLabelWithAi.mockRejectedValue(new Error('503'));
    const onAiFill = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<LabelReader onPick={vi.fn()} onAiFill={onAiFill} />);

    await scan(user);

    expect(await screen.findByText(/AI is nu niet beschikbaar/)).toBeInTheDocument();
    expect(readLabel).toHaveBeenCalled();
    expect(onAiFill).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Willemstad' })).toBeInTheDocument();
  });

  it('never calls the AI without onAiFill', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LabelReader onPick={vi.fn()} />);
    await scan(user);
    expect(readLabelWithAi).not.toHaveBeenCalled();
  });
});
