using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSortOrderToTask : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                table: "Tasks",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("UPDATE Tasks SET SortOrder = Id WHERE SortOrder = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "Tasks");
        }
    }
}
