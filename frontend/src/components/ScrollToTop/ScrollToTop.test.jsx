// ScrollToTop: a new page starts at the top, Back keeps your place.

import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScrollToTop from './ScrollToTop';

// The links and the Back button a visitor would use.
function Controls() {
  const navigate = useNavigate();
  return (
    <>
      <Link to="/services">Services</Link>
      <Link to="/faq#shipping">Shipping question</Link>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <Controls />
    </MemoryRouter>,
  );
}

describe('ScrollToTop', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls to the top when a link opens another page', () => {
    renderAt('/');
    fireEvent.click(screen.getByText('Services'));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });

  it('leaves the position alone on Back', () => {
    renderAt('/');
    fireEvent.click(screen.getByText('Services'));
    window.scrollTo.mockClear();

    fireEvent.click(screen.getByText('Back'));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves a link to a spot on the page alone', () => {
    renderAt('/');
    fireEvent.click(screen.getByText('Shipping question'));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
