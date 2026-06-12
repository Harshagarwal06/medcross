/**
 * Applies URL-driven homepage filters after the main homepage UI is rendered.
 * Kept separate so filtered stats links keep working even if an older cached
 * homepage.js is still controlling the page for one reload.
 */
(function initHomepageUrlFilters() {
    function optionExists(select, value) {
        return Boolean(select && [...select.options].some(option => option.value === value));
    }

    function applyUrlFilters() {
        const params = new URLSearchParams(window.location.search);
        const category = params.get('category') || '';
        const difficulty = params.get('difficulty') || '';
        const query = params.get('q') || '';

        const categorySelect = document.getElementById('category-filter');
        const difficultySelect = document.getElementById('difficulty-filter');
        const searchInput = document.getElementById('puzzle-search');

        if (category && optionExists(categorySelect, category) && categorySelect.value !== category) {
            categorySelect.value = category;
            categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (difficulty && optionExists(difficultySelect, difficulty) && difficultySelect.value !== difficulty) {
            difficultySelect.value = difficulty;
            difficultySelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (query && searchInput && searchInput.value !== query) {
            searchInput.value = query;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyUrlFilters);
    } else {
        requestAnimationFrame(applyUrlFilters);
    }
})();
