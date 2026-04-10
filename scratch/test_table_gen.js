const { formatGenericTable } = require('../src/utils/table-gen');

const columns = [
    { key: 'Name', name: 'Name', width: 25 },
    { key: 'Version', name: 'Version', width: 10 },
    { key: 'Publisher', name: 'Publisher', width: 15 },
    { key: 'Installed', name: 'Installed', width: 10 }
];

const rows = [
    { Name: 'Test App 1', Version: '1.0', Publisher: 'Pub 1', Installed: '2023-01-01' },
    { Name: 'A very long application name that should be truncated', Version: '2.0.1-beta', Publisher: 'A very long publisher name', Installed: '2023-05-12' }
];

const testWidths = [120, 80, 60, 40, 30];

testWidths.forEach(width => {
    console.log(`\n--- Testing with termWidth = ${width} ---`);
    try {
        const table = formatGenericTable({
            title: 'Test Table',
            columns,
            rows,
            context: { screen: { width } }
        });
        console.log(table);
        console.log('Status: SUCCESS');
    } catch (e) {
        console.error('Status: FAILED');
        console.error(e);
    }
});
