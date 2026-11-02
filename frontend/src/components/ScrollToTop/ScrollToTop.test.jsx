// ScrollToTop: a new page starts at the top, Back keeps your place.

import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScrollToTop from './ScrollToTop';

// Hands the test the router's navigate function.
let navigate;
function GrabNavigate() {
  navigate = useNavigate();
  return null;
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <GrabNavigate />
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
    act(() => navigate('/services'));

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    });
  });

  it('leaves the position alone on Back', () => {
    renderAt('/');
    act(() => navigate('/services'));
    window.scrollTo.mockClear();

    act(() => navigate(-1));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves a link to a spot on the page alone', () => {
    renderAt('/');
    act(() => navigate('/faq#shipping'));

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
