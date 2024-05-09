import { computed, ref, toRefs, unref, watch } from "vue";
import {
    defineLayout,
    useStores,
    useItems,
    useCollection,
    useSync,
} from "@directus/extensions-sdk";
import type { Field } from "@directus/types";
import { debounce } from "lodash";
import Actions from "./actions.vue";
import Options from "./options.vue";
import Layout from "./layout.vue";
import type { LayoutOptions, LayoutQuery } from "./types";
// CORE IMPORTS
import { useAliasFields } from "./core-clones/composables/use-alias-fields";
import { syncRefProperty } from "./core-clones/utils/sync-ref-property";
import { formatCollectionItemsCount } from "./core-clones/utils/format-collection-items-count";
import { adjustFieldsForDisplays } from "./core-clones/utils/adjust-fields-for-displays";
import { getDefaultDisplayForType } from "./core-clones/utils/get-default-display-for-type";
import { hideDragImage } from "./core-clones/utils/hide-drag-image";
import type { HeaderRaw, Sort } from "./core-clones/components/v-table/types";

export default defineLayout<LayoutOptions, LayoutQuery>({
    id: "directus-labs-spreadsheet-layout",
    name: "Spreadsheet",
    icon: "table",
    component: Layout,
    slots: {
        options: Options,
        sidebar: () => undefined,
        actions: Actions,
    },
    headerShadow: false,
    setup(props, { emit }) {
        const { useFieldsStore } = useStores();
        const fieldsStore = useFieldsStore();

        const selection = useSync(props, "selection", emit);
        const layoutOptions = useSync(props, "layoutOptions", emit);
        const layoutQuery = useSync(props, "layoutQuery", emit);

        const { collection, filter, filterUser, search } = toRefs(props);

        const {
            info,
            primaryKeyField,
            fields: fieldsInCollection,
            sortField,
        } = useCollection(collection);

        const { sort, limit, page, fields } = useItemOptions();

        const { aliasedFields, aliasQuery, aliasedKeys } = useAliasFields(
            fields,
            collection
        );

        const fieldsWithRelationalAliased = computed(() => {
            return Object.values(aliasedFields.value).reduce<string[]>(
                (acc, value) => {
                    return [...acc, ...value.fields];
                },
                []
            );
        });

        const {
            items,
            loading,
            error,
            totalPages,
            itemCount,
            totalCount,
            changeManualSort,
            getItems,
            getItemCount,
            getTotalCount,
        } = useItems(collection, {
            sort,
            limit,
            page,
            fields: fieldsWithRelationalAliased,
            alias: aliasQuery,
            filter,
            search,
        });

        const {
            tableSort,
            tableHeaders,
            tableRowHeight,
            onSortChange,
            onAlignChange,
            activeFields,
            tableSpacing,
        } = useTable();

        const showingCount = computed(() => {
            const filtering = Boolean(
                (itemCount.value || 0) < (totalCount.value || 0) &&
                    filterUser.value
            );
            return formatCollectionItemsCount(
                itemCount.value || 0,
                page.value,
                limit.value,
                filtering
            );
        });

        const { autoSave, edits, hasEdits, saveEdits, autoSaveEdits } =
            useSaveEdits();

        return {
            tableHeaders,
            items,
            loading,
            error,
            totalPages,
            tableSort,
            onSortChange,
            onAlignChange,
            tableRowHeight,
            page,
            toPage,
            itemCount,
            totalCount,
            fieldsInCollection,
            fields,
            limit,
            activeFields,
            tableSpacing,
            primaryKeyField,
            info,
            showingCount,
            sortField,
            changeManualSort,
            hideDragImage,
            refresh,
            resetPresetAndRefresh,
            selectAll,
            filter,
            search,
            fieldsWithRelationalAliased,
            aliasedFields,
            aliasedKeys,
            autoSave,
            edits,
            hasEdits,
            saveEdits,
            autoSaveEdits,
        };

        async function resetPresetAndRefresh() {
            await props?.resetPreset?.();
            refresh();
        }

        function refresh() {
            getItems();
            getTotalCount();
            getItemCount();
        }

        function toPage(newPage: number) {
            page.value = newPage;
        }

        function selectAll() {
            if (!primaryKeyField.value) return;
            const pk = primaryKeyField.value;
            selection.value = items.value.map((item) => item[pk.field]);
        }

        function useItemOptions() {
            const page = syncRefProperty(layoutQuery, "page", 1);
            const limit = syncRefProperty(layoutQuery, "limit", 25);

            const defaultSort = computed(() => {
                const field = sortField.value ?? primaryKeyField.value?.field;
                return field ? [field] : [];
            });

            const sort = syncRefProperty(layoutQuery, "sort", defaultSort);

            const fieldsDefaultValue = computed(() => {
                return fieldsInCollection.value
                    .filter((field: Field) => !field.meta?.hidden)
                    .slice(0, 4)
                    .map(({ field }: Field) => field)
                    .sort();
            });

            const fields = computed({
                get() {
                    if (layoutQuery.value?.fields) {
                        return layoutQuery.value.fields.filter((field: any) =>
                            fieldsStore.getField(collection.value!, field)
                        );
                    } else {
                        return unref(fieldsDefaultValue);
                    }
                },
                set(value) {
                    layoutQuery.value = Object.assign({}, layoutQuery.value, {
                        fields: value,
                    });
                },
            });

            const fieldsWithRelational = computed(() => {
                if (!props.collection) return [];
                return adjustFieldsForDisplays(fields.value, props.collection);
            });

            return { sort, limit, page, fields, fieldsWithRelational };
        }

        function useTable() {
            const tableSort = computed(() => {
                if (!sort.value?.[0]) {
                    return null;
                } else if (sort.value?.[0].startsWith("-")) {
                    return { by: sort.value[0].substring(1), desc: true };
                } else {
                    return { by: sort.value[0], desc: false };
                }
            });

            const localWidths = ref<{ [field: string]: number }>({});

            watch(
                () => layoutOptions.value,
                () => {
                    localWidths.value = {};
                }
            );

            const saveWidthsToLayoutOptions = debounce(() => {
                layoutOptions.value = Object.assign({}, layoutOptions.value, {
                    widths: localWidths.value,
                });
            }, 350);

            const activeFields = computed<(Field & { key: string })[]>({
                get() {
                    if (!collection.value) return [];

                    return fields.value
                        .map((key: any) => ({
                            ...fieldsStore.getField(collection.value!, key),
                            key,
                        }))
                        .filter(
                            (f: any) =>
                                f &&
                                f.meta?.special?.includes("no-data") !== true
                        ) as (Field & { key: string })[];
                },
                set(val) {
                    fields.value = val.map((field) => field.field);
                },
            });

            const tableHeaders = computed<HeaderRaw[]>({
                get() {
                    return activeFields.value.map((field) => {
                        let description: string | null = null;

                        const fieldParts = field.key.split(".");

                        if (fieldParts.length > 1) {
                            const fieldNames = fieldParts.map(
                                (fieldKey, index) => {
                                    const pathPrefix = fieldParts.slice(
                                        0,
                                        index
                                    );
                                    const field = fieldsStore.getField(
                                        collection.value!,
                                        [...pathPrefix, fieldKey].join(".")
                                    );
                                    return field?.name ?? fieldKey;
                                }
                            );

                            description = fieldNames.join(" -> ");
                        }

                        return {
                            text: field.name,
                            value: field.key,
                            description,
                            width:
                                localWidths.value[field.key] ||
                                layoutOptions.value?.widths?.[field.key] ||
                                null,
                            align:
                                layoutOptions.value?.align?.[field.key] ||
                                "left",
                            field: {
                                // CORE CHANGE: add whole field data and force some properties
                                ...field,
                                hideLabel: true,
                                meta: {
                                    ...field.meta,
                                    width: "fill",
                                    group: null,
                                },
                                // CORE CHANGE end
                                display:
                                    field.meta?.display ||
                                    getDefaultDisplayForType(field.type),
                                displayOptions: field.meta?.display_options,
                                interface: field.meta?.interface,
                                interfaceOptions: field.meta?.options,
                                type: field.type,
                                field: field.field,
                                collection: field.collection,
                            },
                            sortable:
                                [
                                    "json",
                                    "alias",
                                    "presentation",
                                    "translations",
                                ].includes(field.type) === false,
                        } as HeaderRaw;
                    });
                },
                set(val) {
                    const widths = {} as { [field: string]: number };

                    val.forEach((header) => {
                        if (header.width) {
                            widths[header.value] = header.width;
                        }
                    });

                    localWidths.value = widths;

                    saveWidthsToLayoutOptions();

                    fields.value = val.map((header) => header.value);
                },
            });

            const tableSpacing = syncRefProperty(
                layoutOptions,
                "spacing",
                "cozy"
            );

            const tableRowHeight = computed<number>(() => {
                switch (tableSpacing.value) {
                    case "compact":
                        return 32;
                    case "cozy":
                    default:
                        return 48;
                    case "comfortable":
                        return 64;
                }
            });

            return {
                tableSort,
                tableHeaders,
                tableSpacing,
                tableRowHeight,
                onSortChange,
                onAlignChange,
                activeFields,
                getFieldDisplay,
            };

            function onSortChange(newSort: Sort | null) {
                if (!newSort?.by) {
                    sort.value = [];
                    return;
                }

                let sortString = newSort.by;

                if (newSort.desc === true) {
                    sortString = "-" + sortString;
                }

                sort.value = [sortString];
            }

            function onAlignChange(
                field: string,
                align: "left" | "center" | "right"
            ) {
                layoutOptions.value = Object.assign({}, layoutOptions.value, {
                    align: {
                        ...(layoutOptions.value?.align ?? {}),
                        [field]: align,
                    },
                });
            }

            function getFieldDisplay(fieldKey: string) {
                const field = fieldsInCollection.value.find(
                    (field: Field) => field.field === fieldKey
                );

                if (!field?.meta?.display) return null;

                return {
                    display: field.meta.display,
                    options: field.meta.display_options,
                };
            }
        }

        function useSaveEdits() {
            const autoSave = syncRefProperty(layoutOptions, "autosave", true);
            const edits = ref({});
            const hasEdits = computed(
                // TODO: check if single items have edits or they just have empty `{}`
                () => Object.keys(edits.value).length > 0
            );

            return { autoSave, edits, hasEdits, saveEdits, autoSaveEdits };

            function resetEdits() {
                edits.value = {};
            }

            function saveEdits() {
                if (!hasEdits.value) return;

                // TODO: Save content here

                resetEdits();
            }

            function autoSaveEdits() {
                if (!autoSave.value) return;
                saveEdits();
            }
        }
    },
});
