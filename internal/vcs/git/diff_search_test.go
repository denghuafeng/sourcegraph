		name string
		opt  RawLogDiffSearchOptions
		want []*LogCommitSearchResult
				t.Fatal(err)
			if !complete {
				t.Fatal("!complete")
func TestRepository_RawLogDiffSearch_emptyCommit(t *testing.T) {
		"git cmd": {
			results, complete, err := RawLogDiffSearch(ctx, test.repo, *opt)