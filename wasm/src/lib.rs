use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn get_visible_indexes(start: usize, end: usize, revealed: &[usize]) -> Vec<usize> {
    revealed
        .iter()
        .cloned()
        .filter(|&i| i >= start && i < end)
        .collect()
}

#[wasm_bindgen]
pub fn snap_to_batch_offset(scroll_top: usize, item_height: usize, batch_size: usize) -> usize {
    let batch_pixel_size = item_height * batch_size;
    let batch_index = ((scroll_top + batch_pixel_size / 2) / batch_pixel_size) * batch_size;
    batch_index * item_height
}

use wasm_bindgen::prelude::*;
use std::collections::HashMap;

#[wasm_bindgen]
pub fn group_indexes(labels: js_sys::Array) -> js_sys::Map {
    let mut map = js_sys::Map::new();
    for (i, val) in labels.iter().enumerate() {
        let key = val.as_string().unwrap_or_default();
        if !map.has(&JsValue::from(&key)) {
            map.set(&JsValue::from(key), &JsValue::from(i as u32));
        }
    }
    map
}

#[wasm_bindgen]
pub fn compute_scroll_target(
    key: &str,
    current_scroll: usize,
    container_height: usize,
    item_height: usize,
    max_scroll: usize
) -> usize {
    match key {
        "PageDown" => (current_scroll + container_height).min(max_scroll),
        "PageUp" => current_scroll.saturating_sub(container_height),
        "ArrowDown" => (current_scroll + item_height).min(max_scroll),
        "ArrowUp" => current_scroll.saturating_sub(item_height),
        "Home" => 0,
        "End" => max_scroll,
        _ => current_scroll,
    }
}